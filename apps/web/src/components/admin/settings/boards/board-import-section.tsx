import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'

// boardId is unused for now: the hub's uploader doesn't yet accept a
// preselected board via URL. Kept on the props contract so the wizard can
// wire it through without touching this call site again.
interface BoardImportSectionProps {
  boardId: string
}

/** Deep link into the Imports & exports hub, where imports run. */
export function BoardImportSection(_props: BoardImportSectionProps) {
  const intl = useOptionalIntl()
  return (
    <SettingRows>
      <SettingRow
        label={intl.formatMessage({
          id: 'admin.settings.boards.import.posts.label',
          defaultMessage: 'Import posts',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.boards.import.posts.description',
          defaultMessage: 'Bring posts into this board from a CSV file.',
        })}
        control={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings/imports">
              {intl.formatMessage({
                id: 'admin.settings.boards.import.posts.action',
                defaultMessage: 'Go to Imports & exports',
              })}
            </Link>
          </Button>
        }
      />
    </SettingRows>
  )
}
