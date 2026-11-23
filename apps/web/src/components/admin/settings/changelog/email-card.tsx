import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { Switch } from '@/components/ui/switch'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { CsvImportSection } from './csv-import-section'
import { SurfaceSenderRow } from '@/components/admin/channels/surface-sender-row'
import type { ChangelogSettings } from '@/lib/shared/changelog-settings'

interface EmailCardProps {
  settings: ChangelogSettings
  onChange: (patch: Partial<ChangelogSettings>) => void
  disabled?: boolean
}

export function EmailCard({ settings, onChange, disabled }: EmailCardProps) {
  const intl = useOptionalIntl()
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.changelog.email.title',
        defaultMessage: 'Email',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.changelog.email.description',
        defaultMessage: 'Who gets emailed when you publish an entry.',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.changelog.email.sendLabel',
            defaultMessage: 'Send changelog emails',
          })}
          htmlFor="changelog-emails-enabled"
          control={
            <Switch
              id="changelog-emails-enabled"
              checked={!settings.emailsDisabled}
              onCheckedChange={(checked) => onChange({ emailsDisabled: !checked })}
              disabled={disabled}
            />
          }
        />
        <SurfaceSenderRow surface="changelog" />
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.changelog.email.autoSubscribeLabel',
            defaultMessage: 'Auto-subscribe users',
          })}
          description={intl.formatMessage({
            id: 'admin.settings.changelog.email.autoSubscribeDescription',
            defaultMessage: 'Subscribe new users automatically',
          })}
          htmlFor="changelog-auto-subscribe"
          control={
            <Switch
              id="changelog-auto-subscribe"
              checked={settings.autoSubscribe}
              onCheckedChange={(checked) => onChange({ autoSubscribe: checked })}
              disabled={disabled}
            />
          }
        />
        <div className="pt-3.5">
          <CsvImportSection />
        </div>
      </SettingRows>
    </SettingsCard>
  )
}
