import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { ImportCsv } from './import-csv'
import { ImportHistoryList } from './import-history-list'
import { ExportWorkspaceAction } from './export-workspace-action'
import { ExportHistoryList } from './export-history-list'

export function ImportsHubPage() {
  const intl = useOptionalIntl()
  return (
    <SettingsPage page="/admin/settings/imports" width="wide">
      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.imports.import.title',
          defaultMessage: 'Import',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.imports.import.description',
          defaultMessage: 'Import posts from a CSV exported from any tool.',
        })}
      >
        <ImportCsv />
      </SettingsCard>

      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.imports.export.title',
          defaultMessage: 'Export workspace data',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.imports.export.description',
          defaultMessage: 'Everything as one ZIP. Download links expire after 7 days.',
        })}
        action={<ExportWorkspaceAction />}
        flush
      >
        <ExportHistoryList />
      </SettingsCard>

      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.imports.history.title',
          defaultMessage: 'Import history',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.imports.history.description',
          defaultMessage: 'Recent import runs and their results.',
        })}
        flush
      >
        <ImportHistoryList />
      </SettingsCard>
    </SettingsPage>
  )
}
