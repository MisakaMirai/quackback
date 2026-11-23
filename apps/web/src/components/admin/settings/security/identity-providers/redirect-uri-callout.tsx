/**
 * Redirect URI the admin must register at their IdP. Per-provider: built from
 * the provider's `registrationId`.
 *
 * It sits ABOVE the credential fields, because that is the order the work
 * happens in: you register this URI at the IdP and the IdP hands you the
 * client ID and secret in return. Showing it after them invites registering
 * the app without it, which surfaces later as `redirect_uri_mismatch` on the
 * first real sign-in.
 */
import { Label } from '@/components/ui/label'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { CopyButton } from '@/components/shared/copy-button'

export function RedirectUriCallout({ uri, children }: { uri: string; children?: React.ReactNode }) {
  const intl = useOptionalIntl()
  return (
    <div className="space-y-2">
      <div>
        <Label>
          {intl.formatMessage({
            id: 'admin.settings.security.idp.redirectUri',
            defaultMessage: 'Redirect URI',
          })}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.settings.security.idp.redirectUriHelp',
            defaultMessage: "Add this to your provider's allowed redirect URIs.",
          })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs break-all">
          {uri}
        </code>
        <CopyButton
          value={uri}
          aria-label={intl.formatMessage({
            id: 'admin.settings.security.idp.redirectUriCopy',
            defaultMessage: 'Copy redirect URI',
          })}
        />
      </div>
      {children}
    </div>
  )
}
