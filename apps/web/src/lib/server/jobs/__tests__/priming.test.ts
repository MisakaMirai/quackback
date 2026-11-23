/**
 * That priming actually happens.
 *
 * `handler-imports.test.ts` is a source scan: it proves the handler modules
 * *can* be loaded statically. It says nothing about whether anything loads them
 * before a workspace scope opens — and that gap is not hypothetical. With
 * `primeJobHandlers()` gutted to a no-op the whole suite stayed green, because
 * `resolveHandler` would simply import the wrapper at first-job time instead,
 * inside the per-pass workspace scope. The static hoist makes that *worse*, not
 * better: the entire 190-file handler graph would then load under whichever
 * workspace's job ran first.
 *
 * Same shape as the `attempted` counter one layer up — a property everything
 * agreed about and nothing pinned. So this file counts loads.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanupQueues, closeHarness, ensureJobQueueSchema, testDb, uniqueQueue } from './harness'

vi.mock('@/lib/server/db', () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        const handle = testDb()
        const value = Reflect.get(handle as object, prop, handle)
        return typeof value === 'function' ? value.bind(handle) : value
      },
    }
  ),
}))

// The in-scope warning is a diagnostic, and a diagnostic nothing reads is a
// diagnostic that can be deleted. Capture it.
const warnings: unknown[][] = []
const errors: unknown[][] = []
vi.mock('@/lib/server/logger', () => ({
  logger: {
    child: () => ({
      warn: (...a: unknown[]) => warnings.push(a),
      error: (...a: unknown[]) => errors.push(a),
      info: () => {},
      debug: () => {},
    }),
  },
}))

import { __setJobDefinitionsForTests } from '../definitions'
import { claimJobs, enqueueJob } from '../job-queue'
import { primeJobHandlers, resetJobHandlers, runJob } from '../runner'

const created: string[] = []

/** A definition list whose handlers record every time they are loaded. */
function countingDefs(names: string[]): { loads: string[] } {
  const loads: string[] = []
  __setJobDefinitionsForTests(
    names.map((name) => ({
      name,
      maxAttempts: 1,
      leaseMs: 30_000,
      handler: async () => {
        loads.push(name)
        return async () => {}
      },
    }))
  )
  return { loads }
}

function queue(label: string): string {
  const q = uniqueQueue(label)
  created.push(q)
  return q
}

beforeAll(async () => {
  await ensureJobQueueSchema()
})

afterEach(() => {
  __setJobDefinitionsForTests(null)
  resetJobHandlers()
  warnings.length = 0
  errors.length = 0
})

afterAll(async () => {
  await cleanupQueues(created)
  await closeHarness()
})

describe('primeJobHandlers', () => {
  it('loads every registered handler exactly once', async () => {
    const a = queue('prime-a')
    const b = queue('prime-b')
    const { loads } = countingDefs([a, b])

    await primeJobHandlers()

    // The assertion that a no-op prime cannot satisfy.
    expect(loads.sort()).toEqual([a, b].sort())
  })

  it('does not reload on a second prime', async () => {
    const a = queue('prime-twice')
    const { loads } = countingDefs([a])
    await primeJobHandlers()
    await primeJobHandlers()
    expect(loads).toEqual([a])
  })
})

describe('running a job does not import anything', () => {
  it('reuses the primed handler rather than loading it again', async () => {
    const q = queue('prime-run')
    const { loads } = countingDefs([q])
    await primeJobHandlers()
    expect(loads).toEqual([q])

    await enqueueJob({ queue: q, maxAttempts: 1 })
    const [job] = await claimJobs({ specs: [{ queue: q, limit: 1, leaseMs: 30_000 }] })
    expect(await runJob(job)).toBe('succeeded')

    // The assertion that a `resolveHandler` ignoring its memo cannot satisfy:
    // the handler was loaded once, at prime time, and not again for the job.
    expect(loads).toEqual([q])
  })

  it('does not warn when the handler was primed', async () => {
    const q = queue('prime-miss-primed')
    countingDefs([q])
    await enqueueJob({ queue: q, maxAttempts: 1 })
    const [job] = await claimJobs({ specs: [{ queue: q, limit: 1, leaseMs: 30_000 }] })
    await runJob(job)
    expect(warnings.flat().join(' ')).not.toMatch(/imported inside a workspace scope/)
  })
})
