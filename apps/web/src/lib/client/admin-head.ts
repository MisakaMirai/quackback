/**
 * The document title for an admin page: "<section> · <workspace>". A route
 * sets it with `head: adminPageHead('Feedback', 'admin.pageTitle.feedback')`.
 *
 * `head` runs outside React, so the section label comes from the admin layout's
 * loader data (which carries the locale's messages) rather than from a hook.
 * The English argument is the fallback for the default locale and for tests.
 */
interface HeadMatch {
  routeId: string
  context?: unknown
  loaderData?: unknown
}

function adminMessages(matches: ReadonlyArray<HeadMatch>): Record<string, string> {
  const layout = matches.find((match) => match.routeId === '/admin')
  return (layout?.loaderData as { messages?: Record<string, string> } | undefined)?.messages ?? {}
}

export function adminPageHead(section: string, messageId?: string) {
  return ({ matches }: { matches: ReadonlyArray<HeadMatch> }) => {
    const root = matches.find((match) => match.routeId === '__root__')
    const settings = (root?.context as { settings?: { name?: string | null } | null } | undefined)
      ?.settings
    const name = settings?.name?.trim()
    const label = (messageId ? adminMessages(matches)[messageId] : undefined) ?? section
    return { meta: [{ title: name ? `${label} · ${name}` : label }] }
  }
}
