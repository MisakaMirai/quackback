/**
 * Recovery-codes management for the admin's own account.
 *
 * Lists active codes (metadata only — plaintext is shown ONCE in the
 * generation modal). "Generate new codes" invalidates the prior batch
 * and shows the new 10-code list in a show-once modal that requires
 * an explicit acknowledgement before dismissal.
 */
import { useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { LocalDate } from '@/components/ui/local-date'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  KeyIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid'
import { adminQueries } from '@/lib/client/queries/admin'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { generateRecoveryCodesFn } from '@/lib/server/functions/recovery-codes'

function downloadCodes(codes: string[], title: string): void {
  const content = [title, '', ...codes].join('\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quackback-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copyCodes(codes: string[]): Promise<void> {
  await navigator.clipboard.writeText(codes.join('\n'))
}

export function RecoveryCodesSection() {
  const queryClient = useQueryClient()
  const intl = useOptionalIntl()
  const { data } = useSuspenseQuery(adminQueries.recoveryCodes())
  const codes = data.codes
  const activeCount = codes.filter((c) => !c.usedAt).length
  const latest = codes[0]

  const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  const generate = useMutation({
    mutationFn: () => generateRecoveryCodesFn({ data: {} }),
    onSuccess: (result) => {
      setRevealedCodes(result.codes)
      setAcknowledged(false)
      // Invalidate every admin query that depends on whether codes
      // exist. ssoRequiredPreview is the most important — without
      // this, the Require-SSO confirmation modal would show "Not
      // generated" until the next 30s staleTime tick or a full page
      // reload, gating the enable button behind a stale read.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'recoveryCodes'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ssoRequiredPreview'] })
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <KeyIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {intl.formatMessage({
              id: 'admin.settings.security.recoveryCodes.title',
              defaultMessage: 'Recovery codes',
            })}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.security.recoveryCodes.description',
              defaultMessage:
                'One-time break-glass codes to sign in when single sign-on is unavailable.',
            })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {activeCount > 0 && (
              <Badge variant="secondary">
                {intl.formatMessage(
                  {
                    id: 'admin.settings.security.recoveryCodes.active',
                    defaultMessage: '{count} active',
                  },
                  { count: activeCount }
                )}
              </Badge>
            )}
            {latest ? (
              <span className="text-muted-foreground">
                {intl.formatMessage(
                  {
                    id: 'admin.settings.security.recoveryCodes.lastGenerated',
                    defaultMessage: 'Last generated {date}',
                  },
                  { date: <LocalDate date={latest.createdAt} /> }
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.security.recoveryCodes.none',
                  defaultMessage: 'No codes generated yet.',
                })}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="h-9 shrink-0"
        >
          {generate.isPending
            ? intl.formatMessage({
                id: 'admin.settings.security.recoveryCodes.generating',
                defaultMessage: 'Generating…',
              })
            : intl.formatMessage({
                id: 'admin.settings.security.recoveryCodes.generate',
                defaultMessage: 'Generate new codes',
              })}
        </Button>
      </div>

      {/* Low-codes warning. Fires when fewer than 3 codes remain so
       *  the admin sees it before they're down to zero — running out
       *  on the way into a broken-SSO incident is the worst possible
       *  time. Matches GitHub's 3-remaining threshold. Hidden when
       *  no codes exist at all (the empty state speaks for itself). */}
      {activeCount > 0 && activeCount < 3 ? (
        <Alert variant="destructive" className="mt-4">
          <ExclamationTriangleIcon className="size-4" />
          <AlertDescription>
            {intl.formatMessage(
              {
                id: 'admin.settings.security.recoveryCodes.low',
                defaultMessage:
                  'Only {count, plural, one {# recovery code} other {# recovery codes}} left. Generate a fresh batch before you run out. Running out during a broken-SSO incident leaves you locked out.',
              },
              { count: activeCount }
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog
        open={revealedCodes !== null}
        onOpenChange={(open) => {
          // The X / Escape / backdrop always dismiss — codes can be regenerated,
          // so never trap the admin behind the acknowledgement checkbox (which
          // only gates the primary "Done" button).
          if (!open) {
            setRevealedCodes(null)
            setAcknowledged(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({
                id: 'admin.settings.security.recoveryCodes.dialog.title',
                defaultMessage: 'Save these recovery codes',
              })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({
                id: 'admin.settings.security.recoveryCodes.dialog.description',
                defaultMessage:
                  'These codes will not be shown again. Store them somewhere safe, such as a password manager, an encrypted note or a printed copy in a locked drawer.',
              })}
            </DialogDescription>
          </DialogHeader>
          {revealedCodes ? (
            <div className="space-y-3">
              <div className="ph-mask grid grid-cols-2 gap-1.5 rounded-md border bg-muted/30 p-3 font-mono text-sm">
                {revealedCodes.map((code) => (
                  <span key={code} className="select-all">
                    {code}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyCodes(revealedCodes)}>
                  <ClipboardDocumentIcon className="size-3.5" />
                  {intl.formatMessage({
                    id: 'admin.settings.security.recoveryCodes.copy',
                    defaultMessage: 'Copy',
                  })}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCodes(
                      revealedCodes,
                      intl.formatMessage({
                        id: 'admin.settings.security.recoveryCodes.exportTitle',
                        defaultMessage: 'Quackback SSO recovery codes',
                      })
                    )
                  }
                >
                  <ArrowDownTrayIcon className="size-3.5" />
                  {intl.formatMessage({
                    id: 'admin.settings.security.recoveryCodes.download',
                    defaultMessage: 'Download .txt',
                  })}
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  {intl.formatMessage({
                    id: 'admin.settings.security.recoveryCodes.print',
                    defaultMessage: 'Print',
                  })}
                </Button>
              </div>

              <label className="flex items-start gap-2 pt-2 text-xs">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                  data-in-label
                />
                <span>
                  {intl.formatMessage({
                    id: 'admin.settings.security.recoveryCodes.acknowledge',
                    defaultMessage:
                      "I've saved these codes somewhere safe. I understand they won't be shown again.",
                  })}
                </span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              disabled={!acknowledged}
              onClick={() => {
                setRevealedCodes(null)
                setAcknowledged(false)
              }}
            >
              {intl.formatMessage({
                id: 'admin.settings.security.recoveryCodes.done',
                defaultMessage: 'Done',
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
