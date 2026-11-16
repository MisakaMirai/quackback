/**
 * The image entrypoint's migrator role is a one-shot migration job: it runs the
 * bundled `migrate.mjs` and exits without binding PORT. These tests pin the
 * contract on the real file (ordering) and by executing it with a bun shim (so
 * CI does not need a full image build).
 *
 * Image smoke, when a digest is available:
 *
 *   docker run --rm -e QUACKBACK_ROLE=migrator <image>
 *
 * Expects the migrations to apply and the process to exit 0 without starting
 * the server.
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ENTRYPOINT = join(dirname(fileURLToPath(import.meta.url)), '../../../../docker-entrypoint.sh')

function runEntrypoint(
  env: Record<string, string | undefined>,
  bunScript: string
): Promise<{ code: number | null; invocations: string[]; stdout: string; stderr: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'entrypoint-'))
  const bin = join(dir, 'bin')
  const logFile = join(dir, 'bun.log')
  mkdirSync(bin, { recursive: true })
  writeFileSync(logFile, '')
  writeFileSync(join(bin, 'bun'), bunScript.replaceAll('__LOG__', logFile), { mode: 0o755 })
  chmodSync(join(bin, 'bun'), 0o755)

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    PATH: `${bin}:${process.env.PATH}`,
    SKIP_MIGRATIONS: undefined,
    SEED_DATABASE: undefined,
  }
  for (const [k, v] of Object.entries(childEnv)) {
    if (v === undefined) delete childEnv[k]
  }

  return new Promise((resolve, reject) => {
    const child = spawn('sh', [ENTRYPOINT], { env: childEnv })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`entrypoint hung\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, 8_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const invocations = readFileSync(logFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      resolve({ code, invocations, stdout, stderr })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const BUN_SHIM = `#!/bin/sh
printf '%s\\n' "$*" >> "__LOG__"
if [ "$1" = "/app/migrate.mjs" ] || [ "$1" = "/app/seed.mjs" ]; then
  exit 0
fi
if [ "$1" = ".output/server/index.mjs" ]; then
  echo "SERVER_STARTED" >&2
  exit 42
fi
exit 0
`

describe('docker-entrypoint.sh source', () => {
  it('runs migrations and exits for the migrator role, before the server path', () => {
    const raw = readFileSync(ENTRYPOINT, 'utf8')
    const src = raw.replace(/#[^\n]*/g, (m) => ' '.repeat(m.length))
    const roleAt = src.indexOf('"$QUACKBACK_ROLE" = "migrator"')
    const migrateAt = src.indexOf('bun /app/migrate.mjs')
    const serverAt = src.indexOf('bun .output/server/index.mjs')

    expect(roleAt).toBeGreaterThan(-1)
    expect(migrateAt).toBeGreaterThan(roleAt)
    expect(serverAt).toBeGreaterThan(migrateAt)
    expect(raw).toContain('QUACKBACK_ROLE=migrator')
    expect(raw).toContain('exit 0')
  })

  it('leaves the default migrate-then-server path in the file for every other role', () => {
    const raw = readFileSync(ENTRYPOINT, 'utf8')
    expect(raw).toContain('SKIP_MIGRATIONS')
    expect(raw).toContain('SEED_DATABASE')
    expect(raw).toContain('exec bun .output/server/index.mjs')
  })
})

describe.skipIf(process.platform === 'win32')('docker-entrypoint.sh migrator role', () => {
  it('applies migrations, exits 0 and never starts the server', async () => {
    const result = await runEntrypoint({ QUACKBACK_ROLE: 'migrator' }, BUN_SHIM)

    expect(result.code).toBe(0)
    expect(result.invocations).toEqual(['/app/migrate.mjs'])
    expect(result.invocations.join('\n')).not.toContain('.output/server/index.mjs')
    expect(result.stderr).not.toContain('SERVER_STARTED')
  })

  it('does not take the migrator path for web, worker, all, or a case typo', async () => {
    for (const role of ['web', 'worker', 'all', 'Migrator', 'MIGRATOR', undefined]) {
      const result = await runEntrypoint({ QUACKBACK_ROLE: role }, BUN_SHIM)
      expect(result.code, String(role)).toBe(42)
      expect(result.invocations, String(role)).toContain('/app/migrate.mjs')
      expect(result.invocations, String(role)).toContain('.output/server/index.mjs')
    }
  })
})
