/**
 * In-process concurrency caps for the SSE stream endpoint.
 *
 * Two bounds:
 *
 * - a **global** cap, a file-descriptor backstop for the single Bun process;
 * - a **per-IP** cap, so one client cannot monopolize the process's stream
 *   budget.
 *
 * This is a concurrency gauge, not a rate limit — it counts connections open
 * RIGHT NOW, so it lives in-process where the socket lifecycle is authoritative
 * (a shared gauge would leak a slot on every process crash). Presence, which is
 * genuine cross-replica state, stays in Postgres; this backstop is deliberately
 * per-process, matching the FD limit it guards. The client's polling fallback
 * keeps low-priority surfaces working when a stream is refused here.
 */

/** How many streams the single process will hold open at once. */
const MAX_CONCURRENT_STREAMS = 500
/** How many concurrent streams one identified client may hold. Generous enough
 *  for a NAT'd office (many real visitors behind one public IP) while stopping
 *  a single client from opening hundreds of tabs' worth of sockets. */
const MAX_STREAMS_PER_IP = 20

export interface StreamSlot {
  /** Whether a slot was granted. When false, `release` is a no-op. */
  ok: boolean
  /** Return the slot to the pool. Idempotent; a no-op when `ok` is false. */
  release: () => void
}

const NOOP_SLOT: StreamSlot = { ok: false, release: () => {} }

export interface StreamLimiterOptions {
  maxGlobal?: number
  maxPerIp?: number
}

export function createStreamLimiter(opts: StreamLimiterOptions = {}) {
  const maxGlobal = opts.maxGlobal ?? MAX_CONCURRENT_STREAMS
  const maxPerIp = opts.maxPerIp ?? MAX_STREAMS_PER_IP
  let open = 0
  const perIp = new Map<string, number>()

  const bump = (map: Map<string, number>, key: string, by: number): void => {
    const next = (map.get(key) ?? 0) + by
    if (next <= 0) map.delete(key)
    else map.set(key, next)
  }

  return {
    /**
     * Atomically check both caps and reserve a slot. Pass the client IP to
     * enforce the per-IP dimension; pass `undefined` for an unidentifiable
     * client (only the global cap applies then, so a shared "unknown" bucket
     * can't false-positive real visitors).
     */
    acquire(ip?: string): StreamSlot {
      const ipCount = ip === undefined ? 0 : (perIp.get(ip) ?? 0)
      if (open >= maxGlobal) return NOOP_SLOT
      if (ip !== undefined && ipCount >= maxPerIp) return NOOP_SLOT
      open++
      if (ip !== undefined) bump(perIp, ip, 1)
      let released = false
      return {
        ok: true,
        release: () => {
          if (released) return
          released = true
          open = Math.max(0, open - 1)
          if (ip !== undefined) bump(perIp, ip, -1)
        },
      }
    },
    /** Live count of open slots (diagnostics/tests). */
    get openCount() {
      return open
    },
    /** Distinct IPs currently holding a slot (leak check). */
    get ipCount() {
      return perIp.size
    },
  }
}

export const streamLimiter = createStreamLimiter()
