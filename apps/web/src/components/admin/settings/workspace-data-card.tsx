import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from '@heroicons/react/16/solid'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { Button } from '@/components/ui/button'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { SettingsCard } from '@/components/admin/settings/settings-card'

/** Export lives on Imports & exports; this row points there. */
export function WorkspaceDataCard() {
  const intl = useOptionalIntl()
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.data.title',
        defaultMessage: 'Data',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.data.exportLabel',
            defaultMessage: 'Export workspace data',
          })}
          description={intl.formatMessage({
            id: 'admin.settings.data.exportDescription',
            defaultMessage: 'Downloads stay in this workspace. They never include platform keys.',
          })}
          control={
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/settings/imports">
                <ArrowRightIcon className="size-4" />
                {intl.formatMessage({
                  id: 'admin.settings.data.importsLink',
                  defaultMessage: 'Imports & exports',
                })}
              </Link>
            </Button>
          }
        />
      </SettingRows>
    </SettingsCard>
  )
}
