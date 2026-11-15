// @vitest-environment happy-dom
/**
 * The root document mounts the pageview watcher on every page: it sends a
 * beacon on the public surfaces only, and renders only when what it acts on
 * changes, so an admin navigation does not re-render it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { VisitorBeacon } from '../visitor-beacon'

const sendBeacon = vi.fn(() => true)

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, sendBeacon, doNotTrack: null })
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    href: 'http://localhost/',
  } as Location)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sendBeacon.mockClear()
})

const commits = { beacon: 0 }

function buildRouter(initial: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Profiler id="beacon" onRender={() => commits.beacon++}>
          <VisitorBeacon />
        </Profiler>
        <Outlet />
      </>
    ),
  })
  const inbox = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/inbox',
    validateSearch: (search: Record<string, unknown>) => search as { i?: string },
    component: () => <p>inbox page</p>,
  })
  const roadmap = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/roadmap',
    component: () => <p>roadmap page</p>,
  })
  const portal = createRoute({
    getParentRoute: () => rootRoute,
    id: '/_portal',
    component: () => <Outlet />,
  })
  const portalHome = createRoute({
    getParentRoute: () => portal,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => search as { page?: string },
    component: () => <p>portal page</p>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([inbox, roadmap, portal.addChildren([portalHome])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
}

async function mount(initial: string, text: string) {
  commits.beacon = 0
  const router = buildRouter(initial)
  render(<RouterProvider router={router} />)
  await screen.findByText(text)
  return router
}

describe('document watchers', () => {
  it('render nothing for admin navigations', async () => {
    const router = await mount('/admin/inbox', 'inbox page')
    const settled = { ...commits }

    await act(() => router.navigate({ to: '/admin/inbox', search: { i: 'one' } } as never))
    await act(() => router.navigate({ to: '/admin/roadmap' } as never))
    await screen.findByText('roadmap page')

    expect(commits).toEqual(settled)
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('sends a pageview for each public page', async () => {
    const router = await mount('/', 'portal page')
    expect(sendBeacon).toHaveBeenCalledTimes(1)

    await act(() => router.navigate({ to: '/', search: { page: '2' } } as never))
    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  // The admin settings pages frame the live portal as a preview (`?preview=true`);
  // an admin looking at their own settings is not a visitor.
  it('send no pageview from the portal preview', async () => {
    const router = await mount('/?preview=true', 'portal page')

    await act(() => router.navigate({ to: '/', search: { preview: true, page: '2' } } as never))

    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
