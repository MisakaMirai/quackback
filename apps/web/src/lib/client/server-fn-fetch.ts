import { UNEXPECTED_ERROR_MESSAGE } from '@/lib/shared/error-reference'

/**
 * The fetch every server function call in the browser goes through
 * (registered in start.ts).
 *
 * A server function answers in the framework's own format, marked by a header,
 * whether it returned or threw. A 5xx without that mark is not an answer from
 * the function at all: the function was removed by an update this tab has not
 * loaded yet, or a proxy answered while the app was restarting. The framework
 * hands such a JSON body to the caller as if it were the result, so the call
 * resolves with something like `{ status: 500 }` and the screen breaks later.
 * Fail the call here instead, with the plain sentence every toast and inline
 * error already knows how to show.
 *
 * A tab from an older build is the common case, and every call it makes hits
 * the same wall. Reload the document once — that is the only way to pick up the
 * new build — instead of leaving the tab in a state where every action fails.
 * The once-per-window guard keeps a genuinely broken/restarting server from
 * turning into a reload loop.
 */
export const STALE_BUILD_RELOAD_KEY = 'quackback:stale-build-reload-at'
const STALE_BUILD_RELOAD_WINDOW_MS = 30_000

/** The framework marks its own answers with one of these headers. */
function isFrameworkAnswer(response: Response): boolean {
  return (
    response.headers.get('x-tss-serialized') !== null ||
    response.headers.get('x-tss-raw') === 'true'
  )
}

/** A 5xx that did not come from the server function: an old tab or a proxy. */
function isStaleBuildResponse(response: Response): boolean {
  return response.status >= 500 && !isFrameworkAnswer(response)
}

function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload()
}

let reload = defaultReload
/** Per-document attempt flag, for the case where sessionStorage is unavailable. */
let reloadAttempted = false

/** Test seam: replace the navigation and clear the once-per-document state. */
export function __setStaleBuildReloadForTests(fn: (() => void) | null): void {
  reload = fn ?? defaultReload
  reloadAttempted = false
  try {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(STALE_BUILD_RELOAD_KEY)
  } catch {
    // Storage is optional; the in-memory flag still prevents a loop.
  }
}

/**
 * Reload the page at most once per window, across documents. The sessionStorage
 * timestamp survives the reload, so a tab that reloads and still gets a
 * non-framework 5xx settles into the normal error instead of reloading forever.
 */
function reloadOnceForStaleBuild(): void {
  if (reloadAttempted) return
  reloadAttempted = true
  try {
    const now = Date.now()
    const last = Number(window.sessionStorage.getItem(STALE_BUILD_RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && now - last < STALE_BUILD_RELOAD_WINDOW_MS) return
    window.sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, String(now))
  } catch {
    // No sessionStorage (private mode, disabled storage): one reload per
    // document is still safe enough not to loop.
  }
  reload()
}

export async function serverFnFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init)
  if (isStaleBuildResponse(response)) {
    reloadOnceForStaleBuild()
    throw new Error(UNEXPECTED_ERROR_MESSAGE)
  }
  return response
}
