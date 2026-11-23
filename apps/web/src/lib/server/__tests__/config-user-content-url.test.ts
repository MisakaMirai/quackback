/**
 * `USER_CONTENT_URL`: an optional separate origin user files are served from.
 * It must be a bare http(s) origin.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const logged = vi.hoisted(() => ({
  issues: [] as Array<{ path: string; code: string }>,
  warnings: [] as string[],
}))
vi.mock('@/lib/server/logger', () => ({
  logger: {
    child: () => ({
      error: (ctx: { issues?: Array<{ path: string; code: string }> }) => {
        if (ctx?.issues) logged.issues = ctx.issues
      },
      warn: (_ctx: unknown, msg: string) => {
        logged.warnings.push(msg)
      },
      info: () => {},
      debug: () => {},
    }),
  },
}))

let saved: NodeJS.ProcessEnv

beforeEach(() => {
  saved = { ...process.env }
  for (const key of ['DATABASE_URL', 'QUACKBACK_CONTROL_DATABASE_URL', 'USER_CONTENT_URL']) {
    delete process.env[key]
  }
  Object.assign(process.env, {
    BASE_URL: 'https://app.example.com',
    SECRET_KEY: 'x'.repeat(48),
    DATABASE_URL: 'postgresql://app@localhost:5432/quackback',
  })
  logged.issues = []
  logged.warnings = []
})

afterEach(() => {
  process.env = saved
})

async function load(): Promise<
  | { ok: true; value: string | undefined; read: () => string | undefined }
  | { ok: false; paths: string[] }
> {
  const { resetConfig, config } = await import('../config')
  resetConfig()
  try {
    return { ok: true, value: config.userContentUrl, read: () => config.userContentUrl }
  } catch {
    return { ok: false, paths: logged.issues.map((i) => i.path) }
  }
}

describe('USER_CONTENT_URL', () => {
  it('is off when unset or empty', async () => {
    expect(await load()).toMatchObject({ ok: true, value: undefined })
    process.env.USER_CONTENT_URL = ''
    expect(await load()).toMatchObject({ ok: true, value: undefined })
  })

  it('is the bare origin when set', async () => {
    process.env.USER_CONTENT_URL = 'https://files.example.com'
    expect(await load()).toMatchObject({ ok: true, value: 'https://files.example.com' })
    process.env.USER_CONTENT_URL = 'https://Files.Example.com:8443/'
    expect(await load()).toMatchObject({ ok: true, value: 'https://files.example.com:8443' })
    process.env.USER_CONTENT_URL = 'http://localhost:3001'
    expect(await load()).toMatchObject({ ok: true, value: 'http://localhost:3001' })
  })

  it('refuses anything that is not a bare http(s) origin', async () => {
    for (const value of [
      'files.example.com',
      'ftp://files.example.com',
      'javascript:alert(1)',
      'https://files.example.com/api/storage',
      'https://files.example.com/?x=1',
      'https://files.example.com/#frag',
      'https://*.example.com',
      'https://user:pass@files.example.com',
    ]) {
      process.env.USER_CONTENT_URL = value
      expect(await load(), value).toEqual({ ok: false, paths: ['userContentUrl'] })
    }
  })

  it('does not warn when unset', async () => {
    process.env.USER_CONTENT_URL = 'https://files.example.com'
    await load()
    delete process.env.USER_CONTENT_URL
    await load()
    expect(logged.warnings).toHaveLength(0)
  })
})
