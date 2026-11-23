/**
 * The help center landing page's tab title. Settings store the English default
 * title until an admin edits it, so the tab words a default in the page's
 * language, as the hero does, and keeps an admin's own title as written.
 *
 * The landing page itself lives at `/hc/{locale}`; `/hc` only redirects there.
 */
import { describe, expect, it } from 'vitest'
import { getRouteApi } from '@tanstack/react-router'

const { Route: LocaleLanding } = await import('../_portal/hc/$locale/index')

type Head = (ctx: {
  loaderData: Record<string, unknown>
  params?: Record<string, string>
  matches: Array<{ routeId: string; loaderData?: unknown; context?: unknown }>
}) => { meta?: Array<Record<string, string>>; links?: Array<Record<string, string>> }
const headOf = (route: unknown) => (route as { options: { head: Head } }).options.head

// The help center layout, whose loader reads its strings in the page's language.
const polishLayout = {
  routeId: getRouteApi('/_portal/hc').id,
  loaderData: { messages: { 'portal.hc.home.title': 'Jak możemy Ci pomóc?' } },
}

function tabTitle(meta: Array<Record<string, string>> | undefined) {
  return meta?.find((m) => 'title' in m)?.title
}

describe('a language’s help center landing tab title', () => {
  const localeLanding = (title: string | null) =>
    tabTitle(
      headOf(LocaleLanding)({
        loaderData: { title, description: null, workspaceName: 'Acme', logoUrl: null },
        params: { locale: 'en' },
        matches: [polishLayout],
      }).meta
    )

  it('words the default title in the page language', () => {
    expect(localeLanding(null)).toBe('Jak możemy Ci pomóc? - Acme')
    expect(localeLanding('How can we help?')).toBe('Jak możemy Ci pomóc? - Acme')
  })

  it("keeps the language's own title", () => {
    expect(localeLanding('Centre d’aide Acme')).toBe('Centre d’aide Acme - Acme')
  })
})

describe('help center landing canonicals', () => {
  const portal = {
    routeId: '/_portal',
    loaderData: { workspaceName: 'Acme' },
    context: { baseUrl: 'https://feedback.example.com' },
  }

  it('canonicalises the default locale landing to its prefixed path', () => {
    const { links } = headOf(LocaleLanding)({
      loaderData: { title: null, description: null, workspaceName: 'Acme', logoUrl: null },
      params: { locale: 'en' },
      matches: [polishLayout, portal],
    })
    expect(links).toContainEqual({
      rel: 'canonical',
      href: 'https://feedback.example.com/hc/en',
    })
  })

  it("canonicalises another locale's landing to its own prefixed path", () => {
    const { links } = headOf(LocaleLanding)({
      loaderData: { title: null, description: null, workspaceName: 'Acme', logoUrl: null },
      params: { locale: 'de' },
      matches: [polishLayout, portal],
    })
    expect(links).toContainEqual({
      rel: 'canonical',
      href: 'https://feedback.example.com/hc/de',
    })
  })

  it('emits no canonical when the request has no base URL', () => {
    const noBase = { routeId: '/_portal', loaderData: { workspaceName: 'Acme' }, context: {} }
    const locale = headOf(LocaleLanding)({
      loaderData: { title: null, description: null, workspaceName: 'Acme', logoUrl: null },
      params: { locale: 'en' },
      matches: [polishLayout, noBase],
    })
    expect(locale.links).toEqual([])
  })
})
