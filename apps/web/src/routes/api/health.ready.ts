import { createFileRoute } from '@tanstack/react-router'
import { db, sql, getMigrationStatus } from '@/lib/server/db'
import { getJobWorkerStatus } from '@/lib/server/jobs/worker'
import { getProcessRole, shouldRunWorkers } from '@/lib/server/process-role'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'health' })

/** Per-check budget so a hung dependency degrades the probe instead of hanging it. */
const CHECK_TIMEOUT_MS = 3_000

/** Public probe body: booleans and short codes only, never error detail. */
interface CheckResult {
  ok: boolean
  error?: 'failed' | 'timeout' | 'behind'
}

class CheckTimeout extends Error {}
class MigrationsBehind extends Error {}

async function runCheck(name: string, check: () => Promise<void>): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const pending = check()
    // Swallow a late rejection if the timeout already won the race.
    pending.catch(() => {})
    await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CheckTimeout()), CHECK_TIMEOUT_MS)
      }),
    ])
    return { ok: true }
  } catch (err) {
    if (err instanceof CheckTimeout) return { ok: false, error: 'timeout' }
    if (err instanceof MigrationsBehind) return { ok: false, error: 'behind' }
    // Full detail goes to the log; the response carries a short code only.
    log.warn({ err, check: name }, 'readiness check failed')
    return { ok: false, error: 'failed' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * How long a successful registry read stands in for a live probe.
 *
 * Longer than the platform's suspend timer on purpose. Anything shorter and the
 * probe becomes the client that keeps the control compute awake — see below.
 */
async function checkDb(): Promise<void> {
  await db.execute(sql`SELECT 1`)
}

// The bundled journal is frozen at build time and applied rows only grow,
// so a passing check can never regress in-process: cache the success and
// keep querying only while behind (a pod flips ready once the migrator
// catches up).
let migrationsKnownUpToDate = false

/** Test seam: clears the memoized migration result between cases. */
export function resetReadinessCache(): void {
  migrationsKnownUpToDate = false
}

/**
 * There is deliberately NO readiness check for MIN_SCHEMA_VERSION or
 * QUACKBACK_ROLE.
 *
 * `boot-config.ts` validates both at server entry and exits non-zero, so a
 * process serving this route cannot have bad configuration — a check for it
 * would be unreachable code that reads as coverage. An earlier version had one,
 * and it was only ever reachable from a test harness that skipped the boot path;
 * a branch that runs nowhere else is worse than no branch, because it invites
 * the next reader to believe the case is handled.
 */
async function checkMigrations(): Promise<void> {
  if (migrationsKnownUpToDate) return
  const status = await getMigrationStatus(db)
  if (!status.upToDate) throw new MigrationsBehind()
  migrationsKnownUpToDate = true
}

/**
 * Readiness probe: 200 when every dependency check passes, 503 with a
 * per-check breakdown otherwise. Workers still booting don't fail the
 * probe; a worker whose init failed does.
 *
 * ## Every check here names a dependency the process needs to serve
 *
 * There used to be a fourth, pinging Redis. It was removed with Redis itself,
 * and the direction of that change is worth stating because dropping a
 * conjunct from a health signal normally makes it weaker: this one asserted
 * the reachability of a store no request path reads. The cache, the rate
 * buckets, the presence sets and the queues are all tables in the workspace's own
 * database now, so what used to be "is Redis up" is already covered by `db` —
 * and the check could only ever have been a FALSE 503, taking a pod that was
 * serving perfectly out of rotation because a store nothing reads was down.
 *
 * What remains, and what each one fails on:
 *
 *   db          the install's database — the thing every request needs. Down
 *               or slow ⇒ 503.
 *   migrations  the applied ledger is behind the bundled one, so this build's
 *               queries can hit columns that do not exist yet ⇒ 503 `behind`.
 *   workers     a process that should run workers (`worker` or `all`) but
 *               is not running the job worker ⇒ 503. `web` does not expect it.
 *
 * A hung dependency still degrades rather than hangs: `runCheck` gives each one
 * `CHECK_TIMEOUT_MS` and reports `timeout`.
 */
export async function handleReadinessProbe(): Promise<Response> {
  const [dbCheck, migrationsCheck] = await Promise.all([
    runCheck('db', checkDb),
    runCheck('migrations', checkMigrations),
  ])
  // Background work is the job worker rather than a registry of BullMQ
  // workers, so readiness reports that one loop.
  //
  // **`ok` asserts something now.** The old check computed
  // `ok = bootStatus.failed === 0` over eagerly-initialised workers, and a
  // worker that was never *constructed* is not failed — so a replica that
  // started no consumer at all reported `workers ok:true total:0` while every
  // queue silently accumulated. Here a worker-role process that is not running
  // the job worker is NOT ready, and `loops` says whether it is actually
  // serving, which zero would have made obvious.
  const jobWorker = getJobWorkerStatus()
  const expected = shouldRunWorkers()
  const workersCheck = {
    ok: expected ? jobWorker.running : true,
    expected,
    running: jobWorker.running,
    loops: jobWorker.loop ? 1 : 0,
    inFlight: jobWorker.loop?.inFlight ?? 0,
    schemaMissing: jobWorker.loop?.schemaMissing ? 1 : 0,
    // A loop refused by the schema gate. Deliberately reported here and NOT
    // allowed to fail the probe: taking the pod out of rotation would not fix
    // it, and the detail is in the logs.
    refused: jobWorker.loop?.refusedCode ? 1 : 0,
  }

  const ready = dbCheck.ok && migrationsCheck.ok && workersCheck.ok
  const body: Record<string, unknown> = {
    status: ready ? 'ok' : 'unavailable',
    role: getProcessRole(),
    checks: {
      db: dbCheck,
      migrations: migrationsCheck,
      workers: workersCheck,
    },
  }
  return Response.json(body, { status: ready ? 200 : 503 })
}

export const Route = createFileRoute('/api/health/ready')({
  server: {
    handlers: {
      GET: () => handleReadinessProbe(),
    },
  },
})
