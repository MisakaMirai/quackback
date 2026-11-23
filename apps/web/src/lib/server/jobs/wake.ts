/**
 * Web → worker job-wake publisher.
 *
 * In a split deployment (`ROLE=web` plus a separate worker) after-commit on the
 * web process POSTs `{ jobIds }` to the worker's private URL. Subscribes only
 * when both the origin and `QUACKBACK_FLEET_INTERNAL_TOKEN` are present.
 * Fail-open: unset/rejected URL, missing token, or a POST still failing after
 * retries leaves the row until a later wake or an activity refresh that starts
 * the loop. Never awaited from `handleAppHook`.
 */
import { getProcessRole } from '@/lib/server/process-role'
import { logger } from '@/lib/server/logger'
import { onDurableWorkCommitted, type DurableWork } from '@/lib/server/jobs/after-commit'
import { FLEET_INTERNAL_TOKEN_ENV } from '@/lib/server/jobs/internal-auth'
import type { JobWakeAbort, JobWakeRequest } from './worker'

const log = logger.child({ component: 'job-wake' })

const COALESCE_MS = 10
const WAKE_TIMEOUT_MS = 2_000
const WAKE_ATTEMPTS = 3
const WAKE_RETRY_BACKOFF_MS = [200, 400] as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

interface PendingWake {
  jobIds: Set<string>
  abort?: JobWakeAbort
  timer?: ReturnType<typeof setTimeout>
}

let pending: PendingWake | null = null
let unsubscribe: (() => void) | null = null

type JobWorkerUrlParse =
  | { ok: true; origin: string }
  | { ok: false; reason: 'unset' | 'protocol' | 'credentials' | 'parse' }

function parseJobWorkerUrl(): JobWorkerUrlParse {
  const raw = process.env.QUACKBACK_JOB_WORKER_URL?.trim()
  if (!raw) return { ok: false, reason: 'unset' }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return { ok: false, reason: 'protocol' }
    if (url.username || url.password) return { ok: false, reason: 'credentials' }
    return { ok: true, origin: `${url.protocol}//${url.host}` }
  } catch {
    return { ok: false, reason: 'parse' }
  }
}

export function jobWorkerUrl(): string | undefined {
  const parsed = parseJobWorkerUrl()
  return parsed.ok ? parsed.origin : undefined
}

function token(): string | undefined {
  const value = process.env[FLEET_INTERNAL_TOKEN_ENV]
  return value && value.length > 0 ? value : undefined
}

function canPublishJobWake(): boolean {
  return Boolean(jobWorkerUrl() && token())
}

async function postWake(body: JobWakeRequest): Promise<void> {
  const origin = jobWorkerUrl()
  const secret = token()
  if (!origin || !secret) return
  log.info(
    {
      event: 'job.wake_sent',
      job_ids: body.jobIds?.length ?? 0,
      abort: Boolean(body.abort),
    },
    'job wake sent'
  )
  let lastStatus: number | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < WAKE_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${origin}/api/internal/job-wake`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
      })
      await response.body?.cancel()
      if (response.ok) return
      lastStatus = response.status
      lastErr = undefined
    } catch (err) {
      lastErr = err
      lastStatus = undefined
    }
    const backoff = WAKE_RETRY_BACKOFF_MS[attempt]
    if (backoff !== undefined) await delay(backoff)
  }
  log.warn(
    { err: lastErr, status: lastStatus, attempts: WAKE_ATTEMPTS },
    'job-wake POST failed after retries; a later wake or an activity refresh that starts the loop will claim'
  )
}

function flush(): void {
  const entry = pending
  if (!entry) return
  pending = null
  if (entry.timer) clearTimeout(entry.timer)
  void postWake({
    jobIds: [...entry.jobIds],
    abort: entry.abort,
  })
}

function schedule(work: DurableWork, abort?: JobWakeAbort, immediate = false): void {
  let entry = pending
  if (!entry) {
    entry = { jobIds: new Set() }
    pending = entry
  }
  for (const id of work.jobIds) entry.jobIds.add(id)
  if (abort) entry.abort = abort
  if (immediate) {
    flush()
    return
  }
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(flush, COALESCE_MS)
  entry.timer.unref?.()
}

/** Abort payloads bypass debounce so a later after-commit wake cannot drop them. */
export function postJobWakeAbort(abort: JobWakeAbort): void {
  if (getProcessRole() !== 'web' || !canPublishJobWake()) return
  schedule({ jobIds: [] }, abort, true)
}

export function startJobWakePublisher(): void {
  if (unsubscribe) return
  if (getProcessRole() !== 'web') return
  const parsed = parseJobWorkerUrl()
  if (!parsed.ok) {
    if (parsed.reason === 'unset') {
      log.info('QUACKBACK_JOB_WORKER_URL unset — job-wake publisher idle; poll is the floor')
    } else {
      log.warn(
        { reason: parsed.reason },
        'QUACKBACK_JOB_WORKER_URL rejected — job-wake publisher idle; poll is the floor'
      )
    }
    return
  }
  if (!token()) {
    log.warn('QUACKBACK_FLEET_INTERNAL_TOKEN unset — job-wake publisher idle; poll is the floor')
    return
  }
  unsubscribe = onDurableWorkCommitted((work) => schedule(work))
}

export function stopJobWakePublisher(): void {
  unsubscribe?.()
  unsubscribe = null
  if (pending?.timer) clearTimeout(pending.timer)
  pending = null
}

/** Test seam. */
export function __resetJobWakePublisherForTests(): void {
  stopJobWakePublisher()
}
