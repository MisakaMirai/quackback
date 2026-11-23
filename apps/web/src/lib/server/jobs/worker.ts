/**
 * The job worker — one always-on poll loop for the install's single database.
 *
 * One process serves one database, so the worker owns one loop.
 *
 * Happy-path dispatch is start-by-id: after-commit (in-process) or
 * `POST /api/internal/job-wake` (web → worker) calls `claimById`. The poll loop
 * is the sweeper — correctness when a hint is lost, not how work starts.
 *
 * `QUACKBACK_ROLE=web` is a no-op so HTTP replicas stay producer-only.
 */
import { logger } from '@/lib/server/logger'
import { runWithLogContext } from '@/lib/server/log-context'
import { shouldRunWorkers } from '@/lib/server/process-role'
import { onDurableWorkCommitted, type DurableWork } from '@/lib/server/jobs/after-commit'
import { isMissingJobQueue, nextPendingJobAt } from './job-queue'
import { logPausedJobs } from './definitions'
import {
  awaitPool,
  createJobPool,
  createScheduleState,
  dispatchPass,
  poolSize,
  primeJobHandlers,
  resetJobHandlers,
  runJob,
  runMaintenanceTick,
  runScheduleTick,
  runnerConfig,
  startJobsById,
  type RunnerConfig,
} from './runner'
import { convertRelayOwnedEvents } from '@/lib/server/events/event-dispatch-queue'

const log = logger.child({ component: 'job-worker' })

const LOOKAHEAD_MIN_SLEEP_MS = 5_000

/** When an idle loop next needs its database. */
export function idleWakeAt(input: {
  now: number
  pollIntervalMs: number
  nextScheduleAt: number
  nextPendingAt: number | null
}): number {
  let at = Math.min(input.now + input.pollIntervalMs, input.nextScheduleAt)
  if (input.nextPendingAt !== null) at = Math.min(at, input.nextPendingAt)
  return Math.max(input.now, at)
}

/** How much earlier than its interval a reap may run. */
function reapSlackMs(reapIntervalMs: number): number {
  return Math.min(2_000, Math.floor(reapIntervalMs / 10))
}

interface WorkerLoop {
  deactivate(): void
  stop(): Promise<void>
  nudge(): void
  isStopped(): boolean
  inFlightCount(): number
  recentWakeAt: number
  tryStartByIds(jobIds: readonly string[]): Promise<number>
}

interface LoopStats {
  passes: number
  claimed: number
  succeeded: number
  failed: number
  scheduled: number
  scheduleAttempts: number
  requeued: number
  terminated: number
  schemaMissing: boolean
  inFlight: number
  peakInFlight: number
  refusedCode: string | null
}

const loopState: { current: WorkerLoop | null } = { current: null }
let stats: LoopStats | null = null
let running = false
let storedConfig: RunnerConfig | null = null
let unsubscribeCommit: (() => void) | null = null
let loopSetTail: Promise<void> = Promise.resolve()

function withLoopSet<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = loopSetTail.then(fn, fn)
  loopSetTail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function emptyStats(): LoopStats {
  return {
    passes: 0,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    scheduled: 0,
    scheduleAttempts: 0,
    requeued: 0,
    terminated: 0,
    schemaMissing: false,
    inFlight: 0,
    peakInFlight: 0,
    refusedCode: null,
  }
}

function startLoop(cfg: RunnerConfig): WorkerLoop {
  const s = emptyStats()
  stats = s

  let stopped = false
  let waitResolve: (() => void) | null = null
  let pendingNudge = false
  let nextScheduleAt = 0
  let nextMaintenanceAt = 0
  let nextPruneAt = 0
  const schedule = createScheduleState()
  const pool = createJobPool()

  const handle: WorkerLoop = {
    recentWakeAt: 0,
    nudge() {
      pendingNudge = true
      this.recentWakeAt = Date.now()
      const resolve = waitResolve
      waitResolve = null
      resolve?.()
    },
    inFlightCount() {
      return poolSize(pool)
    },
    async tryStartByIds(jobIds) {
      if (jobIds.length === 0 || stopped) return 0
      return startJobsById({
        pool,
        config: cfg,
        jobIds,
        run: (job) => runJob(job),
        onSettled: (_queue, outcome) => {
          if (outcome === 'succeeded') s.succeeded += 1
          else if (outcome === 'failed') s.failed += 1
          s.inFlight = poolSize(pool)
          handle.nudge()
        },
      })
    },
    deactivate() {
      if (stopped) return
      stopped = true
      handle.nudge()
    },
    isStopped() {
      return stopped
    },
    async stop() {
      handle.deactivate()
      await awaitPool(pool)
      if (loopState.current === handle) {
        loopState.current = null
        stats = null
      }
      log.info({ event: 'job.loop_stopped' }, 'job loop stopped')
    },
  }

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      if (pendingNudge) {
        pendingNudge = false
        resolve()
        return
      }
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        waitResolve = null
        resolve()
      }
      const timer = setTimeout(done, ms)
      timer.unref?.()
      waitResolve = done
    })

  const loop = async () => {
    while (running && !stopped) {
      let wakeAt: number | null = null
      try {
        const now = Date.now()
        const result = await (async () => {
          try {
            await convertRelayOwnedEvents()
          } catch (err) {
            log.warn({ err }, 'relay-owned event convert failed')
          }
          if (now >= nextScheduleAt) {
            const tick = await runScheduleTick(schedule, new Date(now))
            s.scheduled += tick.enqueued
            s.scheduleAttempts += tick.attempted
            nextScheduleAt = tick.nextSlotAt ? tick.nextSlotAt.getTime() : now + 60_000
          }
          if (now >= nextMaintenanceAt) {
            const prune = now >= nextPruneAt
            const maintenance = await runMaintenanceTick(cfg, { prune })
            s.requeued += maintenance.requeued
            s.terminated += maintenance.terminated
            nextMaintenanceAt = now + cfg.reapIntervalMs - reapSlackMs(cfg.reapIntervalMs)
            if (prune) nextPruneAt = now + cfg.pruneIntervalMs
          }
          if (stopped) return { claimed: 0, saturated: true, nextPendingAt: null }
          const dispatched = await dispatchPass({
            pool,
            config: cfg,
            run: (job) => runJob(job),
            onSettled: (_queue, outcome) => {
              if (outcome === 'succeeded') s.succeeded += 1
              else if (outcome === 'failed') s.failed += 1
              s.inFlight = poolSize(pool)
              handle.nudge()
            },
          })
          const sleepsFor = Math.min(nextScheduleAt, Date.now() + cfg.pollIntervalMs) - Date.now()
          const lookAhead =
            (dispatched.claimed === 0 || dispatched.saturated) && sleepsFor > LOOKAHEAD_MIN_SLEEP_MS
          const nextPendingAt = lookAhead ? await nextPendingJobAt() : null
          return { ...dispatched, nextPendingAt }
        })()
        if (!running || stopped) break

        s.passes += 1
        s.claimed += result.claimed
        s.inFlight = poolSize(pool)
        if (s.inFlight > s.peakInFlight) s.peakInFlight = s.inFlight
        s.schemaMissing = false
        if (result.claimed > 0 && !result.saturated) continue
        if (pendingNudge) {
          pendingNudge = false
          continue
        }
        wakeAt = idleWakeAt({
          now: Date.now(),
          pollIntervalMs: cfg.pollIntervalMs,
          nextScheduleAt,
          nextPendingAt: result.nextPendingAt?.getTime() ?? null,
        })
      } catch (err) {
        if (isMissingJobQueue(err)) {
          if (!s.schemaMissing) {
            s.schemaMissing = true
            log.warn(
              'job_queue is absent in this database; skipping the queue rather than crash-looping'
            )
          }
        } else {
          log.error({ err }, 'job loop pass failed')
        }
      }
      if (!running || stopped) break
      await wait(wakeAt === null ? cfg.pollIntervalMs : Math.max(0, wakeAt - Date.now()))
    }
  }

  void runWithLogContext({ request_id: crypto.randomUUID(), route: 'jobs:worker' }, loop).catch(
    (err) => log.error({ err, event: 'job.loop_exited' }, 'job loop exited')
  )

  log.info({ event: 'job.loop_started', poll_interval_ms: cfg.pollIntervalMs }, 'job loop started')

  return handle
}

export async function startJobWorker(): Promise<void> {
  if (running) return
  if (!shouldRunWorkers()) {
    log.info('QUACKBACK_ROLE=web — job worker not started')
    return
  }
  running = true
  const cfg = runnerConfig()
  storedConfig = cfg
  unsubscribeCommit = onDurableWorkCommitted((work) => {
    void acceptDurableWork(work).catch((err) =>
      log.error({ err }, 'after-commit start-by-id failed')
    )
  })

  await primeJobHandlers()
  logPausedJobs()

  const loop = startLoop(cfg)
  loopState.current = loop
  log.info(
    { event: 'job.worker_started', workspaces: 1, poll_interval_ms: cfg.pollIntervalMs },
    'job worker started'
  )
}

export async function stopJobWorker(): Promise<void> {
  const wasRunning = running
  running = false
  storedConfig = null
  unsubscribeCommit?.()
  unsubscribeCommit = null
  const loop = loopState.current
  loopState.current = null
  if (loop) {
    loop.deactivate()
    await loop.stop()
  }
  resetJobHandlers()
  if (wasRunning) log.info({ event: 'job.worker_stopped' }, 'job worker stopped')
}

export interface JobWakeAbort {
  team: string
  channel: string
  thread: string
}

export interface JobWakeRequest {
  jobIds?: string[]
  abort?: JobWakeAbort
}

async function acceptDurableWork(work: DurableWork): Promise<void> {
  await wakeWorker(work.jobIds)
}

/**
 * Start-by-id for the install's loop. No-op when this process is not the worker.
 */
export async function wakeWorker(jobIds: readonly string[]): Promise<void> {
  if (!running || !shouldRunWorkers()) return
  const cfg = storedConfig
  if (!cfg) return

  const loop = await withLoopSet(() => {
    const existing = loopState.current
    if (!existing || existing.isStopped()) return undefined
    existing.nudge()
    return existing
  })

  if (!loop || loop.isStopped()) return
  loop.nudge()
  if (jobIds.length > 0) {
    const claimed = await loop.tryStartByIds(jobIds)
    if (claimed > 0 && stats) {
      stats.claimed += claimed
      stats.inFlight = loop.inFlightCount()
      if (stats.inFlight > stats.peakInFlight) stats.peakInFlight = stats.inFlight
    }
  }
}

export function isJobWorkerRunning(): boolean {
  return running && shouldRunWorkers()
}

export async function handleJobWake(request: JobWakeRequest): Promise<void> {
  log.info(
    {
      event: 'job.wake_received',
      job_ids: request.jobIds?.length ?? 0,
      abort: Boolean(request.abort),
    },
    'job wake received'
  )
  if (request.abort) {
    log.info({ event: 'job.wake_abort_ignored' }, 'job-wake abort is unused')
  }
  await wakeWorker(request.jobIds ?? [])
}

export interface JobWorkerStatus {
  running: boolean
  /** The install's one loop, or null when this process is not running it. */
  loop: LoopStats | null
}

export function getJobWorkerStatus(): JobWorkerStatus {
  return {
    running,
    loop: stats,
  }
}
