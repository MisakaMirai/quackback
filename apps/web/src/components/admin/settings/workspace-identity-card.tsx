import { Input } from '@/components/ui/input'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { Label } from '@/components/ui/label'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { LogoUploader } from '@/components/admin/settings/logo-uploader'

export function WorkspaceIdentityCard(props: {
  workspaceName: string
  managed: boolean
  onWorkspaceNameChange: (value: string) => void
  maxLength?: number
  /** Bring the logo control into view and highlight it (the `?focus=logo` deep link). */
  focusLogo?: boolean
}) {
  const intl = useOptionalIntl()
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.workspace.title',
        defaultMessage: 'Workspace',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.workspace.description',
        defaultMessage: 'Your logo and name, shown across the portal and emails.',
      })}
    >
      <div className="flex items-center gap-4">
        <LogoUploader workspaceName={props.workspaceName} focus={props.focusLogo} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="workspace-name" className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.workspace.nameLabel',
              defaultMessage: 'Workspace name',
            })}
          </Label>
          <Input
            id="workspace-name"
            value={props.workspaceName}
            onChange={(e) => props.onWorkspaceNameChange(e.target.value)}
            placeholder={intl.formatMessage({
              id: 'admin.settings.workspace.namePlaceholder',
              defaultMessage: 'My Workspace',
            })}
            disabled={props.managed}
            maxLength={props.maxLength}
          />
          {props.managed && (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.workspace.managed',
                defaultMessage: "Managed by your administrator's config. Edit it there.",
              })}
            </p>
          )}
        </div>
      </div>
    </SettingsCard>
  )
}
