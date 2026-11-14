import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import type { Role } from '@/lib/shared/roles'
import { sessionRole, toSessionScope } from '@/lib/shared/roles'
import {
  colorSchemeHintHeaders,
  getThemeCookie,
  parsePrefersColorScheme,
  type Theme,
} from '@/lib/shared/theme'
import { getUpdateBannerDismissedVersionCookie } from '@/lib/shared/update-banner-cookie'
import { resolveLocale, type SupportedLocale } from '@/lib/shared/i18n'
import { redactSettingsForClient } from '@/lib/shared/redact-portal-config'
import {
  getSetupState,
  isOnboardingComplete,
  needsCloudOnboardingWizard,
} from '@/lib/shared/db-types'
import type { Session, PrincipalType } from '@/lib/server/auth/session'
import type { WorkspaceSettings } from '@/lib/server/domains/settings'
import type { SessionId, UserId } from '@quackback/ids'
import { logger } from '@/lib/server/logger'
import { getCurrentWorkspace } from '@/lib/server/workspaces/workspace-context'
import { analyticsWorkspaceKey } from '@/lib/shared/analytics-identity'

const log = logger.child({ component: 'bootstrap' })

export interface BootstrapData {
  baseUrl: string
  session: Session | null
  /**
   * The workspace settings as a browser may see them: redacted by
   * `redactSettingsForClient`, and with the raw settings row emptied (every
   * client reader uses the parsed fields beside it).
   */
  settings: WorkspaceSettings | null
  /** Onboarding progress, decided here so the raw setup state never leaves the server. */
  onboarding: { complete: boolean; needsSetupWizard: boolean }
  userRole: Role | null
  themeCookie: Theme
  /** OS color-scheme preference from the `Sec-CH-Prefers-Color-Scheme` client
   *  hint, used by the root document to resolve a `system` theme during SSR.
   *  null when the browser didn't send the hint (e.g. Firefox/Safari, or a
   *  first visit); the document then resolves it in a <head> script. */
  prefersColorScheme: 'light' | 'dark' | null
  /** Dot-paths managed by `/etc/quackback/config.yaml`. The matching
   *  in-app form controls render disabled when the path appears here.
   *  Empty list = nothing locked. */
  managedFieldPaths: string[]
  /** Provider IDs that Better-Auth would register at boot — used by
   *  the admin login UI to gate CTAs on actually-usable providers, not
   *  just DB intent. A stale `ssoOidc.enabled=true` with no
   *  `auth_sso` row in `platform_credentials` will NOT include 'sso'
   *  here, so the UI never renders an SSO button that would 404. */
  registeredAuthProviders: string[]
  /** Locale resolved from the request's Accept-Language header, used by the
   *  root document to set `<html lang>`/`dir` during SSR. Resolved here so it
   *  rides the bootstrap request without a separate round-trip. */
  acceptLanguageLocale: SupportedLocale
  /** Version string the admin update banner was dismissed for, read from the
   *  `update_banner_dismissed_version` cookie, or null if never dismissed.
   *  Threaded into the admin route the same way `themeCookie` is, so the
   *  banner renders in its final expanded/collapsed state on first paint. */
  updateBannerDismissedVersion: string | null
  /**
   * Browser product analytics for the admin app, present only when the
   * operator set `POSTHOG_KEY`. `workspaceId` is the opaque group key the
   * admin events and this workspace's instance ping share
   * (see analytics-identity.ts).
   */
  productAnalytics: {
    key: string
    /** Where the SDK sends: PostHog, or a reverse proxy in front of it. */
    apiHost: string
    /** The PostHog app, for toolbar links; null when it cannot be known. */
    uiHost: string | null
    sessionRecording: boolean
    /** Replays hide every text node, not only inputs. */
    maskText: boolean
    /** Replays hide every input value, not only passwords. */
    maskInputs: boolean
    workspaceId: string | null
  } | null
}

// Returns both the session (with principalType) AND the user role from one
// principal read, both shared with every other identity read in the request.
async function getSessionAndRole(): Promise<{
  session: Session | null
  role: Role | null
}> {
  // Fast-path for unauthenticated requests: if there's no Cookie header at
  // all the request can't possibly carry a session token, so we can skip
  // every dynamic import below + the session lookup. Hot path for every
  // cold-start landing-page hit since the visitor has no cookies.
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const headers = getRequestHeaders()
  if (!headers.get('cookie')) {
    return { session: null, role: null }
  }

  const { getRequestSession, getRequestPrincipal } =
    await import('@/lib/server/auth/request-session')

  try {
    const session = await getRequestSession()

    if (!session?.user) {
      return { session: null, role: null }
    }

    const userId = session.user.id as UserId
    const principalRecord = await getRequestPrincipal(userId)

    const scope = toSessionScope(session.session.scope)

    return {
      session: {
        session: {
          id: session.session.id as SessionId,
          expiresAt: session.session.expiresAt.toISOString(),
          createdAt: session.session.createdAt.toISOString(),
          updatedAt: session.session.updatedAt.toISOString(),
          userId,
          scope,
        },
        user: {
          id: userId,
          name: session.user.name,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          image: session.user.image ?? null,
          principalType: (principalRecord?.type as PrincipalType) ?? 'user',
          ...(principalRecord?.type === 'anonymous'
            ? { displayName: principalRecord.displayName ?? null }
            : {}),
          createdAt: session.user.createdAt.toISOString(),
          updatedAt: session.user.updatedAt.toISOString(),
        },
      },
      role: principalRecord ? sessionRole(principalRecord.role as Role, scope) : null,
    }
  } catch (error) {
    // During SSR, auth might fail due to env var issues
    // Return null session and let the client retry
    log.error({ err: error }, 'get session failed')
    return { session: null, role: null }
  }
}

/**
 * What of the workspace settings may leave the server. This function's
 * response goes to any browser that asks, signed in or not, on every
 * client-side navigation as well as into the SSR document, so it is scrubbed
 * here rather than by the route that asked.
 */
function clientSafeSettings(settings: WorkspaceSettings): WorkspaceSettings {
  const redacted = redactSettingsForClient(settings)
  return { ...redacted, settings: {} as WorkspaceSettings['settings'] }
}

const getBootstrapDataInternal = createServerOnlyFn(async (): Promise<BootstrapData> => {
  const [
    { getWorkspaceSettings },
    { getRegisteredAuthProviders },
    { config },
    { getRequestHeaders, setResponseHeader },
    { resolveHelpCenterBaseUrl },
  ] = await Promise.all([
    import('@/lib/server/domains/settings/settings.service'),
    import('@/lib/server/auth/registered-providers'),
    import('@/lib/server/config'),
    import('@tanstack/react-start/server'),
    import('@/lib/server/domains/help-center/help-center-domain.service'),
  ])

  // Single principal read returns both session.principalType + userRole;
  // run in parallel with the settings fetch.
  const [{ session, role: userRole }, settings, registeredAuthProviders] = await Promise.all([
    getSessionAndRole(),
    getWorkspaceSettings(),
    getRegisteredAuthProviders(),
  ])

  const headers = getRequestHeaders()
  const themeCookie = getThemeCookie(headers.get('cookie') ?? null)
  const updateBannerDismissedVersion = getUpdateBannerDismissedVersionCookie(
    headers.get('cookie') ?? null
  )
  const acceptLanguageLocale = resolveLocale(headers.get('accept-language'))

  // Ask for the prefers-color-scheme client hint, so Chromium sends the OS
  // preference with later requests and a `system` theme is rendered here. A
  // document rendered without it (a first visit, Firefox, Safari) resolves the
  // theme in a <head> script instead (see colorSchemeHintHeaders).
  for (const [name, value] of Object.entries(colorSchemeHintHeaders())) {
    setResponseHeader(name, value)
  }
  // This document is keyed on every input we render into it: the `theme` cookie
  // (and the session/role embedded in the dehydrated context), Accept-Language
  // for `<html lang>`/`dir`, the color-scheme hint, and now Host (below,
  // baseUrl switches to the help center's verified custom domain when the
  // request arrives on it). List them all so a shared cache can never serve
  // e.g. a dark-cookie document to a no-cookie visitor that happens to share
  // the same hint.
  setResponseHeader('Vary', 'Cookie, Accept-Language, Sec-CH-Prefers-Color-Scheme, Host')
  const prefersColorScheme = parsePrefersColorScheme(headers.get('sec-ch-prefers-color-scheme'))

  // Canonical URLs switch to the help center's custom domain when the
  // request actually arrived on it (domains/languages §1) -- everywhere else
  // (boards, changelog, etc.) this is a no-op and baseUrl is just BASE_URL.
  const baseUrl = resolveHelpCenterBaseUrl({
    domainConfig: settings?.helpCenterConfig?.domain,
    currentHost: headers.get('host'),
    fallback: config.baseUrl,
  })
  const setupState = getSetupState(settings?.settings?.setupState ?? null)

  return {
    baseUrl,
    session,
    settings: settings ? clientSafeSettings(settings) : null,
    onboarding: {
      complete: isOnboardingComplete(setupState),
      needsSetupWizard: needsCloudOnboardingWizard(setupState),
    },
    userRole,
    themeCookie,
    prefersColorScheme,
    managedFieldPaths: settings?.managedFieldPaths ?? [],
    registeredAuthProviders,
    acceptLanguageLocale,
    updateBannerDismissedVersion,
    productAnalytics: config.productAnalytics
      ? {
          key: config.productAnalytics.key,
          apiHost: config.productAnalytics.host,
          uiHost: config.productAnalytics.uiHost,
          sessionRecording: config.productAnalytics.sessionRecording,
          maskText: config.productAnalytics.maskText,
          maskInputs: config.productAnalytics.maskInputs,
          workspaceId: await analyticsWorkspaceKey(
            getCurrentWorkspace()?.workspaceKey,
            typeof settings?.settings?.id === 'string' ? settings.settings.id : null
          ),
        }
      : null,
  }
})

export const getBootstrapData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BootstrapData> => {
    log.debug('get bootstrap data')
    return await getBootstrapDataInternal()
  }
)
