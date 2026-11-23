import { CopyButton } from '@/components/shared/copy-button'
import { WarningBox } from '@/components/shared/warning-box'
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

interface SecretRevealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  secretLabel: string
  secretValue: string | null
  confirmLabel?: string
  /** The copy warning and button, for copy in another language. */
  warningTitle?: string
  warningDescription?: string
  copyLabel?: string
  children?: React.ReactNode
}

export function SecretRevealDialog({
  open,
  onOpenChange,
  title,
  description,
  secretLabel,
  secretValue,
  confirmLabel,
  warningTitle,
  warningDescription,
  copyLabel,
  children,
}: SecretRevealDialogProps) {
  const intl = useOptionalIntl()
  const resolvedConfirmLabel =
    confirmLabel ??
    intl.formatMessage({
      id: 'common.secretReveal.confirm',
      defaultMessage: "I've saved this",
    })
  const resolvedWarningTitle =
    warningTitle ??
    intl.formatMessage({ id: 'common.secretReveal.warningTitle', defaultMessage: 'Copy this now' })
  const resolvedWarningDescription =
    warningDescription ??
    intl.formatMessage({
      id: 'common.secretReveal.warningDescription',
      defaultMessage:
        "This is the only time you'll see it. Store it securely and never share it publicly.",
    })
  const resolvedCopyLabel =
    copyLabel ??
    intl.formatMessage({ id: 'common.copyToClipboard', defaultMessage: 'Copy to clipboard' })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <WarningBox
            variant="warning"
            title={resolvedWarningTitle}
            description={resolvedWarningDescription}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">{secretLabel}</label>
            <div className="flex items-center gap-2">
              <code className="ph-mask flex-1 rounded-lg bg-muted px-3 py-2.5 font-mono text-sm break-all">
                {secretValue}
              </code>
              <CopyButton value={secretValue ?? ''} aria-label={resolvedCopyLabel} />
            </div>
          </div>

          {children}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{resolvedConfirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
