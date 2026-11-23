/**
 * After-commit job signaling.
 *
 * A job inserted on the caller's transaction is not visible to another
 * connection until that transaction commits. Signaling the scheduler before
 * commit can inspect an empty queue and go back to sleep — or fire for a row
 * that then rolls back.
 *
 * `db.transaction` is wrapped so every outer commit flushes the job ids
 * recorded during that transaction. Rollback discards them. Nested
 * `db.transaction` calls are savepoints: an inner throw restores the pending
 * set to the snapshot taken on entry.
 *
 * Enqueue outside a wrapped transaction is already committed, so it delivers
 * immediately.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'after-commit' })

export interface DurableWork {
  /** Job ids inserted in this commit. Empty when the note was a wake-only signal. */
  jobIds: string[]
}

interface AfterCommitFrame {
  depth: number
  /** Job ids noted in this frame. */
  pending: Set<string>
}

const frames = new AsyncLocalStorage<AfterCommitFrame>()

type DurableWorkSink = (work: DurableWork) => void

const sinks: DurableWorkSink[] = []

/** Test seam. */
export function __resetAfterCommitForTests(): void {
  sinks.length = 0
}

/**
 * Called after a durable job (or equivalent) is visible.
 *
 * The job worker registers here so an after-commit flush rings the in-process
 * scheduler (`claimById` + nudge). A split web/worker deployment registers an
 * HTTP publisher instead (`wake.ts`).
 */
export function onDurableWorkCommitted(sink: DurableWorkSink): () => void {
  sinks.push(sink)
  return () => {
    const i = sinks.indexOf(sink)
    if (i >= 0) sinks.splice(i, 1)
  }
}

export function noteDurableWork(opts?: { committed?: boolean; jobId?: string }): void {
  const frame = frames.getStore()
  if (frame && frame.depth > 0) {
    if (opts?.jobId) frame.pending.add(opts.jobId)
    return
  }
  if (opts?.committed === false) return
  deliver({ jobIds: opts?.jobId ? [opts.jobId] : [] })
}

function deliver(work: DurableWork): void {
  for (const sink of sinks) {
    try {
      sink(work)
    } catch (err) {
      log.error({ err }, 'after-commit sink threw')
    }
  }
}

function flushPending(pending: Set<string>): void {
  const jobIds = [...pending]
  pending.clear()
  deliver({ jobIds })
}

/**
 * Run `fn` as one after-commit frame. The real `db.transaction` wrapper
 * calls this; tests can call it directly.
 */
export async function runInAfterCommitFrame<T>(fn: () => Promise<T>): Promise<T> {
  const parent = frames.getStore()
  if (parent) {
    const snapshot = new Set(parent.pending)
    parent.depth += 1
    try {
      return await fn()
    } catch (err) {
      parent.pending.clear()
      for (const id of snapshot) parent.pending.add(id)
      throw err
    } finally {
      parent.depth -= 1
    }
  }

  const frame: AfterCommitFrame = { depth: 1, pending: new Set() }
  return frames.run(frame, async () => {
    try {
      const result = await fn()
      flushPending(frame.pending)
      return result
    } catch (err) {
      frame.pending.clear()
      throw err
    }
  })
}

/** Bind a drizzle `transaction` method so its commit flushes pending work. */
export function wrapDbTransaction<TArgs extends unknown[], TResult>(
  transaction: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  return ((...args: TArgs) => runInAfterCommitFrame(async () => await transaction(...args))) as (
    ...args: TArgs
  ) => TResult
}
