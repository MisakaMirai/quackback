import { ArrowPathIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export interface InvitePeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  emailsInput: string
  messageInput: string
  emailError: string | null
  batchResults: null | { sent: number; failed: Array<{ email: string; error: string }> }
  sendBusy: boolean
  onEmailsChange: (value: string) => void
  onMessageChange: (value: string) => void
  onSend: () => void
}

/**
 * The portal-invite send form, lifted into a Dialog. State is owned by the
 * parent (PortalInvitesSection or InvitationsView) so the dialog can stay
 * open on partial failure (showing the per-address error list) and reset
 * cleanly on close.
 *
 * Shared between:
 *  - Portal Settings ▸ Email invites (PortalAuthTab)
 *  - /admin/users ▸ Invitations view (InvitationsView)
 */
export function InvitePeopleDialog({
  open,
  onOpenChange,
  emailsInput,
  messageInput,
  emailError,
  batchResults,
  sendBusy,
  onEmailsChange,
  onMessageChange,
  onSend,
}: InvitePeopleDialogProps) {
  const intl = useOptionalIntl()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.people.invites.dialogTitle',
              defaultMessage: 'Invite users to the portal',
            })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.people.invites.dialogDescription',
              defaultMessage:
                "They'll get a magic link to sign in and access the portal, no password needed.",
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSend()
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium">
              {intl.formatMessage({
                id: 'admin.people.invites.emailsLabel',
                defaultMessage: 'Email addresses',
              })}
            </span>
            <Textarea
              value={emailsInput}
              onChange={(e) => onEmailsChange(e.target.value)}
              placeholder={'alice@acme.com, bob@acme.com\ncarol@acme.com'}
              rows={4}
              className="mt-1.5 font-mono text-sm"
              disabled={sendBusy}
              aria-label={intl.formatMessage({
                id: 'admin.people.invites.emailsAria',
                defaultMessage: 'Email addresses to invite',
              })}
              aria-invalid={!!emailError}
              autoFocus
            />
            <span className="text-xs text-muted-foreground mt-1 block">
              {intl.formatMessage({
                id: 'admin.people.invites.emailsHelp',
                defaultMessage:
                  'Separate addresses with commas, spaces, or newlines. Up to 50 at a time.',
              })}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              {intl.formatMessage({
                id: 'admin.people.invites.messageLabel',
                defaultMessage: 'Personal message (optional)',
              })}
            </span>
            <Textarea
              value={messageInput}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.people.invites.messagePlaceholder',
                defaultMessage: "Hi! We'd love your feedback on the new beta.",
              })}
              rows={3}
              className="mt-1.5 text-sm"
              maxLength={500}
              disabled={sendBusy}
              aria-label={intl.formatMessage({
                id: 'admin.people.invites.messageAria',
                defaultMessage: 'Optional personal message',
              })}
            />
          </label>

          {emailError && (
            <p className="text-xs text-destructive" role="alert">
              {emailError}
            </p>
          )}

          {/* Only partial-failure results land here — full-success closes
              the dialog before this can render. */}
          {batchResults && batchResults.failed.length > 0 && (
            <div
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-400"
              role="status"
            >
              <p className="font-medium">
                {intl.formatMessage(
                  {
                    id: 'admin.people.invites.batchSummary',
                    defaultMessage: '{sent} sent, {failed} failed.',
                  },
                  { sent: batchResults.sent, failed: batchResults.failed.length }
                )}
              </p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {batchResults.failed.map((f) => (
                  <li key={f.email}>
                    <span className="font-mono">{f.email}</span>: {f.error}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">
                {intl.formatMessage({
                  id: 'admin.people.invites.failedHint',
                  defaultMessage:
                    'The failed addresses have been kept in the field above. Fix them and try again.',
                })}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={sendBusy || !emailsInput.trim()}>
              {sendBusy ? <ArrowPathIcon className="mr-2 h-3 w-3 animate-spin" /> : null}
              {intl.formatMessage({
                id: 'admin.people.invites.send',
                defaultMessage: 'Send invites',
              })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
