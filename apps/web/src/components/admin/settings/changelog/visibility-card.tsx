import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { VISIBILITY_LABELS, VisibilityTiles } from '@/components/admin/settings/visibility-tiles'
import type { ChangelogSettings } from '@/lib/shared/changelog-settings'

interface VisibilityCardProps {
  settings: ChangelogSettings
  onChange: (patch: Partial<ChangelogSettings>) => void
  disabled?: boolean
}

const OPTIONS: Array<{ value: ChangelogSettings['audience']; title: string; titleId: string }> = [
  {
    value: 'public',
    title: VISIBILITY_LABELS.everyone,
    titleId: 'admin.settings.changelog.visibility.everyone',
  },
  {
    value: 'authenticated',
    title: VISIBILITY_LABELS.signedIn,
    titleId: 'admin.settings.changelog.visibility.signedIn',
  },
]

export function VisibilityCard({ settings, onChange, disabled }: VisibilityCardProps) {
  const intl = useOptionalIntl()
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.changelog.visibility.title',
        defaultMessage: 'Visibility',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.changelog.visibility.description',
        defaultMessage: 'Who can see the changelog.',
      })}
    >
      <VisibilityTiles
        name="changelog-audience"
        value={settings.audience}
        onChange={(audience) => onChange({ audience })}
        options={OPTIONS.map(({ title, titleId, ...option }) => ({
          ...option,
          title: intl.formatMessage({ id: titleId, defaultMessage: title }),
        }))}
        disabled={disabled}
        className="sm:grid-cols-2"
      />
    </SettingsCard>
  )
}
