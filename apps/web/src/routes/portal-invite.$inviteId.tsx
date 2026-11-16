/**
 * Portal invite accept route.
 *
 * Flat route — intentionally NOT under _portal so the portal access gate
 * does not fire before the invitee has accepted. The route path is
 * `/portal-invite/:inviteId` which matches the callbackPath set by
 * mintPortalInviteMagicLink.
 *
 * Flow:
 *   1. Magic-link handler signs the user in, then redirects here.
 *   2. Loader reads the session. If absent → redirect to /auth/login with
 *      callbackUrl so the user lands back here after signing in.
 *   3. Session present → call acceptPortalInviteFn.
 *   4. Accepted → redirect to / (portal gate now sees the accepted invite).
 *   5. Any other status → return it so the component renders a message.
 */
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useIntl, type MessageDescriptor } from 'react-intl'
import { PortalIntlProvider } from '@/components/portal-intl-provider'
import {
  acceptPortalInviteFn,
  type AcceptPortalInviteResult,
} from '@/lib/server/functions/portal-invites'
import { DEFAULT_LOCALE, loadPortalMessages, type SupportedLocale } from '@/lib/shared/i18n'
import { buildSigninRedirect } from '@/lib/shared/auth-prompt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoaderData = (AcceptPortalInviteResult | { status: 'not_found' } | { status: 'error' }) & {
  locale: SupportedLocale
  messages: Record<string, string>
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/portal-invite/$inviteId')({
  loader: async ({ params, context }): Promise<LoaderData> => {
    const { inviteId } = params
    const { session } = context

    if (!session?.user) {
      throw redirect(buildSigninRedirect(`/portal-invite/${inviteId}`))
    }

    const locale = context.acceptLanguageLocale ?? DEFAULT_LOCALE
    const messages = await loadPortalMessages(locale)

    try {
      const result = await acceptPortalInviteFn({ data: { inviteId } })

      if (result.status === 'accepted') {
        throw redirect({ to: '/' })
      }

      return { ...result, locale, messages }
    } catch (err) {
      // Re-throw redirects so TanStack Router handles them.
      if (err && typeof err === 'object' && 'isRedirect' in err) {
        throw err
      }

      const message = err instanceof Error ? err.message : ''

      // Unauthenticated — redirect to sign-in dialog with a callback so the
      // user lands back here after signing in.
      if (message === 'Authentication required') {
        throw redirect(buildSigninRedirect(`/portal-invite/${inviteId}`))
      }

      if (message === 'PORTAL_INVITE_NOT_FOUND') {
        return { status: 'not_found', locale, messages }
      }

      // Unexpected error — show a generic message instead of misleading the
      // user with "invite not found". The acceptPortalInviteFn server fn owns
      // server-side error logging for this path.
      return { status: 'error', locale, messages }
    }
  },
  component: PortalInviteRoute,
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PortalInviteRoute() {
  const { locale, messages } = Route.useLoaderData()

  return (
    <PortalIntlProvider locale={locale} messages={messages}>
      <PortalInvitePage />
    </PortalIntlProvider>
  )
}

function PortalInvitePage() {
  const intl = useIntl()
  const data = Route.useLoaderData()

  const { title, body } = getMessage(data.status)

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight">{intl.formatMessage(title)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{intl.formatMessage(body)}</p>
        <a
          href="/"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          {intl.formatMessage({
            id: 'portal.invite.goToPortal',
            defaultMessage: 'Go to portal',
          })}
        </a>
      </Card>
    </PageShell>
  )
}

function getMessage(status: LoaderData['status']): {
  title: MessageDescriptor
  body: MessageDescriptor
} {
  switch (status) {
    case 'canceled':
      return {
        title: { id: 'portal.invite.revoked.title', defaultMessage: 'Invite revoked' },
        body: {
          id: 'portal.invite.revoked.body',
          defaultMessage:
            'This invitation has been revoked. Please ask the workspace admin to send a new one.',
        },
      }
    case 'expired':
      return {
        title: { id: 'portal.invite.expired.title', defaultMessage: 'Invite expired' },
        body: {
          id: 'portal.invite.expired.body',
          defaultMessage:
            'This invitation has expired. Please ask the workspace admin to resend it.',
        },
      }
    case 'mismatch':
      return {
        title: { id: 'portal.invite.mismatch.title', defaultMessage: 'Wrong account' },
        body: {
          id: 'portal.invite.mismatch.body',
          defaultMessage:
            'This invite was sent to a different email address. Please sign in with the address it was sent to, then open the link again.',
        },
      }
    case 'email_not_verified':
      return {
        title: {
          id: 'portal.invite.emailNotVerified.title',
          defaultMessage: 'Verify your email first',
        },
        body: {
          id: 'portal.invite.emailNotVerified.body',
          defaultMessage:
            'Your email address needs to be verified before you can accept this invitation. Please check your inbox for a verification email, then try the invite link again.',
        },
      }
    case 'not_found':
      return {
        title: { id: 'portal.invite.notFound.title', defaultMessage: 'Invite not found' },
        body: {
          id: 'portal.invite.notFound.body',
          defaultMessage:
            'This invitation could not be found. It may have already been used or does not exist.',
        },
      }
    case 'error':
      return {
        title: { id: 'portal.invite.error.title', defaultMessage: 'Something went wrong' },
        body: {
          id: 'portal.invite.error.body',
          defaultMessage:
            'An unexpected error occurred. Please try again later or contact the workspace admin.',
        },
      }
    default:
      return {
        title: { id: 'portal.invite.notFound.title', defaultMessage: 'Invite not found' },
        body: {
          id: 'portal.invite.notFound.bodyShort',
          defaultMessage: 'This invitation could not be found.',
        },
      }
  }
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 25% 15%, var(--primary), transparent),
            radial-gradient(ellipse 50% 80% at 80% 85%, var(--primary), transparent)
          `,
        }}
      />
      <div className="relative w-full max-w-md py-12">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-medium text-muted-foreground">Quackback</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-8 text-center backdrop-blur-sm"
      style={{
        boxShadow:
          '0 0 80px -20px oklch(0.886 0.176 86 / 0.12), 0 20px 40px -12px rgb(0 0 0 / 0.08)',
      }}
    >
      {children}
    </div>
  )
}
