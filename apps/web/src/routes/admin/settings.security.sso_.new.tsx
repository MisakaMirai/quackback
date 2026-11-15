import { createFileRoute } from '@tanstack/react-router'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { assertRoutePermission } from '@/lib/shared/route-permission'
import { ProviderCreatePage } from '@/components/admin/settings/security/identity-providers/provider-create-page'
import { adminPageHead } from '@/lib/client/admin-head'

// The trailing underscore on "sso_" escapes nesting under
// /admin/settings/security/sso, which is a redirect-only route for stale
// bookmarks. The URL is still /admin/settings/security/sso/new.
export const Route = createFileRoute('/admin/settings/security/sso_/new')({
  head: adminPageHead('New single sign-on provider'),
  beforeLoad: ({ context }) => {
    assertRoutePermission(context.permissions, PERMISSIONS.AUTH_MANAGE)
  },
  loader: async () => {
    // Generated here rather than in the component so the server render and
    // the client agree: the redirect URI built from it is shown before
    // hydration and may be copied into the IdP straight away.
    const { newRegistrationId } =
      await import('@/components/admin/settings/security/identity-providers/provider-shared')
    return { registrationId: newRegistrationId() }
  },
  component: SsoCreateRoute,
})

function SsoCreateRoute() {
  const { registrationId } = Route.useLoaderData()
  return <ProviderCreatePage registrationId={registrationId} />
}
