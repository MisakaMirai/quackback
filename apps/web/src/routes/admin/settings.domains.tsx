import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import { assertRouteAnyPermission } from '@/lib/shared/route-permission'
import { DOMAINS_PAGE_PERMISSIONS } from '@/lib/shared/domains-permissions'
import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import {
  EmailSendingSection,
  HelpCenterAddressSection,
  NoDomains,
  SignInSection,
} from '@/components/admin/settings/domains-overview'
import {
  getHelpCenterDomainSummaryFn,
  getSendingDomainSummariesFn,
  getSignInDomainSummariesFn,
  type HelpCenterDomainSummary,
  type SendingDomainSummary,
  type SignInDomainSummary,
} from '@/lib/server/functions/domains-overview'
import { adminPageHead } from '@/lib/client/admin-head'

export const Route = createFileRoute('/admin/settings/domains')({
  head: adminPageHead('Domains settings', 'admin.pageTitle.domainsSettings'),
  loader: async ({ context }) => {
    assertRouteAnyPermission(context.permissions, DOMAINS_PAGE_PERMISSIONS)
    const can = (permission: PermissionKey) => context.permissions?.includes(permission) ?? false
    const webAddresses = can(PERMISSIONS.SETTINGS_CUSTOM_DOMAIN)

    const [sending, signIn, helpCenterDomain] = await Promise.all([
      can(PERMISSIONS.CHANNEL_ACCOUNT_MANAGE)
        ? getSendingDomainSummariesFn().catch(() => [] as SendingDomainSummary[])
        : ([] as SendingDomainSummary[]),
      can(PERMISSIONS.AUTH_MANAGE)
        ? getSignInDomainSummariesFn().catch(() => [] as SignInDomainSummary[])
        : ([] as SignInDomainSummary[]),
      webAddresses
        ? getHelpCenterDomainSummaryFn().catch(() => null)
        : (null as HelpCenterDomainSummary | null),
    ])
    return {
      sending,
      signIn,
      helpCenterDomain,
      canOpenHelpCenter: can(PERMISSIONS.HELP_CENTER_MANAGE),
    }
  },
  component: DomainsSettingsPage,
})

function DomainsSettingsPage() {
  const { sending, signIn, helpCenterDomain, canOpenHelpCenter } = Route.useLoaderData()
  const empty = !helpCenterDomain && sending.length === 0 && signIn.length === 0

  return (
    <SettingsPage page="/admin/settings/domains" description="Every domain this workspace uses.">
      {helpCenterDomain && (
        <HelpCenterAddressSection domain={helpCenterDomain} canOpen={canOpenHelpCenter} />
      )}
      {sending.length > 0 && <EmailSendingSection domains={sending} canOpen />}
      {signIn.length > 0 && <SignInSection domains={signIn} canOpen />}
      {empty && <NoDomains />}
    </SettingsPage>
  )
}
