import { SettingsCard } from '@/components/admin/settings/settings-card'
import { MacrosManager } from '@/components/admin/conversation/macros-manager'

export function MacrosSettingsBody({
  creating,
  onCreatingChange,
}: {
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}) {
  return (
    <SettingsCard flush>
      <MacrosManager creating={creating} onCreatingChange={onCreatingChange} />
    </SettingsCard>
  )
}
