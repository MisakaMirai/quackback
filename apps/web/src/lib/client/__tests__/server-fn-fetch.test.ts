// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNEXPECTED_ERROR_MESSAGE } from '@/lib/shared/error-reference'
import { describeError } from '@/lib/shared/describe-error'
import {
  serverFnFetch,
  __setStaleBuildReloadForTests,
  STALE_BUILD_RELOAD_KEY,
} from '../server-fn-fetch'

function answer(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const reload = vi.fn()

beforeEach(() => {
  __setStaleBuildReloadForTests(reload)
  reload.mockClear()
})

afterEach(() => vi.unstubAllGlobals())

describe('serverFnFetch', () => {
  it('reloads the tab when a call targets a function the running server no longer has', async () => {
    // What a production build answers for an unknown server function id.
    answer(json({ status: 500, unhandled: true, message: 'HTTPError' }, 500))
    const error = await serverFnFetch('/_serverFn/removed').then(
      () => null,
      (e: unknown) => e
    )
    expect(reload).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(UNEXPECTED_ERROR_MESSAGE)
    expect(describeError(error, "Couldn't create roadmap", { team: true, online: true })).toEqual({
      title: "Couldn't create roadmap",
      description: UNEXPECTED_ERROR_MESSAGE,
    })
  })

  it('reloads a call a proxy answered while the app was restarting', async () => {
    answer(json({ message: 'Bad Gateway' }, 502))
    await expect(serverFnFetch('/_serverFn/x')).rejects.toThrow(UNEXPECTED_ERROR_MESSAGE)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload again on the next call in the same document', async () => {
    answer(json({ status: 500, unhandled: true }, 500))
    await expect(serverFnFetch('/_serverFn/x')).rejects.toThrow(UNEXPECTED_ERROR_MESSAGE)
    await expect(serverFnFetch('/_serverFn/y')).rejects.toThrow(UNEXPECTED_ERROR_MESSAGE)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when a reload already happened inside the window', async () => {
    window.sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, String(Date.now()))
    answer(json({ message: 'Bad Gateway' }, 502))
    await expect(serverFnFetch('/_serverFn/x')).rejects.toThrow(UNEXPECTED_ERROR_MESSAGE)
    expect(reload).not.toHaveBeenCalled()
  })

  it('passes on an error the function itself threw', async () => {
    const thrown = json({ t: 'error' }, 500, { 'x-tss-serialized': 'true' })
    answer(thrown)
    await expect(serverFnFetch('/_serverFn/x')).resolves.toBe(thrown)
    expect(reload).not.toHaveBeenCalled()
  })

  it('passes on a raw response the function returned', async () => {
    const raw = json({ error: 'upstream' }, 503, { 'x-tss-raw': 'true' })
    answer(raw)
    await expect(serverFnFetch('/_serverFn/x')).resolves.toBe(raw)
    expect(reload).not.toHaveBeenCalled()
  })

  it('passes on results and refusals below 500', async () => {
    for (const status of [200, 403, 404, 405]) {
      const response = json({ ok: status === 200 }, status)
      answer(response)
      await expect(serverFnFetch('/_serverFn/x')).resolves.toBe(response)
    }
    expect(reload).not.toHaveBeenCalled()
  })

  it('sends the request it was given', async () => {
    answer(json({}, 200))
    const init = { method: 'POST', body: '{}' }
    await serverFnFetch('/_serverFn/x', init)
    expect(fetch).toHaveBeenCalledWith('/_serverFn/x', init)
  })
})
