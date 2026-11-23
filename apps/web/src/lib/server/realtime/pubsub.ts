/**
 * Realtime fan-out over Postgres `LISTEN`/`NOTIFY`.
 *
 * One process serves one install and one database, so there is one NOTIFY
 * channel and one dedicated session-mode connection. The connection opens when
 * the first subscriber arrives and closes when the last one leaves, so a process
 * with no live SSE streams holds none.
 *
 * ## One channel, not one per topic
 *
 * `pg_notify`'s channel is an identifier capped at 63 bytes, and a logical
 * channel like `conversation:<uuid>` does not fit. So every message travels on
 * {@link REALTIME_CHANNEL} and the envelope names the logical channel. That also
 * means one LISTEN rather than one per stream.
 *
 * ## Oversized payloads
 *
 * `pg_notify` rejects a payload over 8000 bytes, and a message carrying a whole
 * conversation event can reach that. Those are written to `realtime_overflow`
 * and the envelope carries the row id; the listener reads the body back on its
 * own connection. The reader never deletes the row — several replicas may each
 * need it — and the sweeper reclaims it.
 *
 * ## Delivery is verified, not assumed
 *
 * Through a transaction-mode pooler `LISTEN` is accepted and nothing is ever
 * delivered, so the first subscriber triggers a round-trip probe (see
 * `pg-listener.ts`). A failure is logged with the remedy rather than silently
 * leaving realtime quiet.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/server/db'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'
import { config } from '@/lib/server/config'
import { openRealtimeListener, type RealtimeListener } from './pg-listener'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'pubsub' })

/**
 * `pg_notify`'s hard limit is 8000 bytes; leave room for the envelope's own
 * braces and key names so the check is on the thing actually sent.
 */
const NOTIFY_PAYLOAD_LIMIT = 7_800

/** How long an overflow row is readable before the sweeper reclaims it. */
const OVERFLOW_TTL_SECONDS = 60

/** Wire envelope: `c` the logical channel, `p` the payload inline, `o` an overflow row id. */
interface Envelope {
  c: string
  p?: unknown
  o?: string
}

type Handler = (message: string) => void

/**
 * Logical channel -> in-process handlers.
 *
 * A plain Map rather than a `BoundedCache`: an LRU would evict a live SSE
 * stream's handler once enough other entries arrived, silently stopping
 * delivery to a connection that is still open. Bounded by the number of live
 * SSE streams on this process, which the connection limiter caps.
 */
const listeners = new Map<string, Set<Handler>>()

interface RealtimeConnection {
  listener: RealtimeListener
  /** Number of registered handlers across all channels. */
  refs: number
}

/**
 * The process's dedicated LISTEN connection, opened on demand. Same reasoning
 * as `listeners`: it must not be evicted out from under live streams.
 */
let connection: RealtimeConnection | null = null

/** In-flight open, so N concurrent subscribes share one connection. */
let opening: Promise<RealtimeConnection> | null = null

function dispatch(listener: RealtimeListener, raw: string): void {
  // Delivery-check probes share the channel and are not envelopes.
  if (raw.startsWith('__verify__')) return
  let envelope: Envelope
  try {
    envelope = JSON.parse(raw) as Envelope
  } catch (err) {
    log.warn({ err }, 'undecodable realtime payload')
    return
  }
  if (typeof envelope.c !== 'string') return

  const handlers = listeners.get(envelope.c)
  if (!handlers || handlers.size === 0) return

  if (typeof envelope.o === 'string') {
    // Oversized: the body is in a row, read back on the listener's own
    // connection. Several replicas may each need it, so the reader must not
    // delete it — the sweeper reclaims it.
    void listener
      .fetchOverflow(envelope.o)
      .then((body) => {
        if (body === null) return
        emit(handlers, JSON.stringify(body))
      })
      .catch((err) => log.warn({ err }, 'overflow fetch failed'))
    return
  }

  emit(handlers, JSON.stringify(envelope.p ?? null))
}

function emit(handlers: Set<Handler>, message: string): void {
  for (const fn of handlers) {
    try {
      fn(message)
    } catch (err) {
      log.error({ err }, 'listener threw')
    }
  }
}

/**
 * One notify round trip after the listener first connects. Behind a
 * transaction-mode pooler `LISTEN` is accepted and nothing is delivered, so
 * without this check realtime goes quiet with no signal. Never throws: a
 * failed check must not take down the subscribe that triggered it.
 */
async function checkDelivery(listener: RealtimeListener): Promise<void> {
  let ok: boolean
  try {
    ok = await listener.verify()
  } catch (err) {
    // The probe itself failed (outage, connection limit), so nothing is known
    // about delivery and the pooler diagnosis would be a guess.
    log.warn({ err }, 'realtime delivery check could not run')
    return
  }
  if (ok) return
  const remedy = 'DATABASE_URL must be a direct or session-mode connection'
  log.error(
    { remedy },
    `realtime notifications are not being delivered. Realtime uses Postgres LISTEN/NOTIFY, ` +
      `so ${remedy}, not a transaction-mode pooler (for example PgBouncer in transaction mode).`
  )
}

async function acquireConnection(): Promise<RealtimeConnection> {
  if (connection) {
    connection.refs += 1
    return connection
  }
  if (opening) {
    const conn = await opening
    conn.refs += 1
    return conn
  }

  const promise = (async () => {
    // LISTEN/NOTIFY needs a session-mode connection; DATABASE_URL is the
    // install's direct DSN.
    const url = config.databaseUrl
    // `dispatch` needs the listener to read overflow rows back on its own
    // connection, and the listener needs `onPayload` to construct. The box
    // closes the cycle without a partially-initialised binding.
    const box: { listener: RealtimeListener | null } = { listener: null }
    const listener = await openRealtimeListener({
      directUrl: url,
      label: 'single',
      onPayload: (raw) => {
        if (box.listener) dispatch(box.listener, raw)
      },
    })
    box.listener = listener
    const conn: RealtimeConnection = { listener, refs: 0 }
    connection = conn
    void checkDelivery(listener)
    return conn
  })()

  opening = promise
  try {
    const conn = await promise
    conn.refs += 1
    return conn
  } finally {
    opening = null
  }
}

async function releaseConnection(): Promise<void> {
  const conn = connection
  if (!conn) return
  conn.refs -= 1
  if (conn.refs > 0) return
  connection = null
  await conn.listener.close().catch((err) => log.warn({ err }, 'listener close failed'))
}

/**
 * Subscribe to one or more channels. The handler is invoked with the raw
 * string payload for every published message on any of those channels.
 * Returns an async unsubscribe function that removes this handler and drops
 * the underlying connection once no listeners remain.
 */
export async function subscribe(
  channels: string[],
  onMessage: (channel: string, message: string) => void
): Promise<() => Promise<void>> {
  // A presence-only stream subscribes to no logical channels. Opening a
  // session-mode LISTEN for it would pin a connection for the life of a
  // heartbeat. The connection is acquired only when there is something to hear.
  const needsListener = channels.length > 0
  if (needsListener) await acquireConnection()

  const registered: Array<{ key: string; fn: Handler }> = []
  for (const channel of channels) {
    // The handler is told the logical name it asked for.
    const fn: Handler = (message: string) => onMessage(channel, message)
    let set = listeners.get(channel)
    if (!set) {
      set = new Set()
      listeners.set(channel, set)
    }
    set.add(fn)
    registered.push({ key: channel, fn })
  }

  // One connection reference per subscribe() call, released once on unsubscribe,
  // so a caller that subscribes to three channels does not have to unsubscribe
  // three times for the connection to close.
  let released = false
  return async () => {
    for (const { key, fn } of registered) {
      const set = listeners.get(key)
      if (!set) continue
      set.delete(fn)
      if (set.size === 0) listeners.delete(key)
    }
    if (released) return
    released = true
    if (needsListener) await releaseConnection()
  }
}

/**
 * Publish a payload to a channel. Fire-and-forget: a delivery failure must
 * never break the write that triggered it (the message is already committed
 * to Postgres).
 *
 * Not awaited by callers, so the promise is swallowed here rather than left to
 * become an unhandled rejection.
 */
export function publish(channel: string, payload: unknown): void {
  void publishAsync(channel, payload).catch((err) => log.warn({ err, channel }, 'publish failed'))
}

/** The awaitable form, for tests and for callers that want back-pressure. */
export async function publishAsync(channel: string, payload: unknown): Promise<void> {
  const inline = JSON.stringify({ c: channel, p: payload } satisfies Envelope)
  if (Buffer.byteLength(inline, 'utf8') <= NOTIFY_PAYLOAD_LIMIT) {
    await db.execute(sql`SELECT pg_notify(${'quackback_realtime'}, ${inline})`)
    return
  }

  const result = await db.execute(sql`
    INSERT INTO realtime_overflow (channel, payload, expires_at)
    VALUES (
      ${channel},
      ${JSON.stringify(payload ?? null)}::jsonb,
      now() + make_interval(secs => ${OVERFLOW_TTL_SECONDS})
    )
    RETURNING id
  `)
  const rows = getExecuteRows<{ id: string | number | bigint }>(result)
  const id = rows[0]?.id
  if (id === undefined) throw new Error('realtime overflow insert returned no id')
  const envelope = JSON.stringify({ c: channel, o: String(id) } satisfies Envelope)
  await db.execute(sql`SELECT pg_notify(${'quackback_realtime'}, ${envelope})`)
}

/** Drain the listener connection on graceful shutdown. */
export async function closeSubscriber(): Promise<void> {
  const open = connection
  connection = null
  listeners.clear()
  if (open) await open.listener.close().catch(() => {})
}

/**
 * Test seam: whether this process currently holds a dedicated LISTEN
 * connection. Exported so the connection-lifecycle test observes the real
 * registry rather than reconstructing it.
 */
export function openListenerCount(): number {
  return connection ? 1 : 0
}
