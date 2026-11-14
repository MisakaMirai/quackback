import { createFileRoute, redirect } from '@tanstack/react-router'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { assertRoutePermission } from '@/lib/shared/route-permission'
import { isProductEnabled } from '@/lib/shared/types/settings'
import { useState } from 'react'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { NewButton } from '@/components/shared/new-button'
import { MacrosSettingsBody } from '@/components/admin/settings/macros-settings-body'
import { warmQuery } from '@/lib/client/queries/warm-query'
import { adminPageHead } from '@/lib/client/admin-head'

export const Route = createFileRoute('/admin/settings/macros')({
  head: adminPageHead('Macros settings'),
  beforeLoad: ({ context }) => {
    if (!isProductEnabled(context.settings?.featureFlags, 'support')) {
      throw redirect({ to: '/admin/settings/general' })
    }
  },
  loader: async ({ context }) => {
    assertRoutePermission(context.permissions, PERMISSIONS.CONVERSATION_MANAGE)
    // Warm the library so the page renders complete from the document.
    const { macrosQuery } = await import('@/lib/client/queries/macros')
    await warmQuery(context.queryClient, macrosQuery())
  },
  component: MacrosSettingsPage,
})

function MacrosSettingsPage() {
  const [creating, setCreating] = useState(false)
  return (
    <SettingsPage
      page="/admin/settings/macros"
      description="Reusable replies with variables and bundled actions."
      actions={<NewButton noun="macro" onClick={() => setCreating(true)} />}
    >
      <MacrosSettingsBody creating={creating} onCreatingChange={setCreating} />
    </SettingsPage>
  )
}
