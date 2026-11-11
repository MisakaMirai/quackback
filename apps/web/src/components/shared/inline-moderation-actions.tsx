import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { EyeSlashIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/shared/utils'

interface InlineModerationActionsProps {
  /** When false, nothing renders. */
  pending: boolean
  busy?: boolean
  onApprove?: () => void
  onReject?: () => void
  /** Shown in the badge, e.g. "post" or "comment". */
  noun: string
  className?: string
}

/**
 * Pending-review chrome + Approve/Reject, used wherever a held post or
 * comment already renders for someone who can moderate it.
 */
export function InlineModerationActions({
  pending,
  busy = false,
  onApprove,
  onReject,
  noun,
  className,
}: InlineModerationActionsProps) {
  const intl = useOptionalIntl()
  if (!pending) return null
  const nounLabel = intl.formatMessage({
    id: `portal.moderation.noun.${noun}`,
    defaultMessage: noun,
  })
  const canAct = Boolean(onApprove || onReject)
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5',
        className
      )}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <EyeSlashIcon className="h-3.5 w-3.5" />
        {intl.formatMessage({
          id: 'portal.moderation.pending',
          defaultMessage: 'Pending review',
        })}
      </span>
      <span className="text-xs text-amber-700/80 dark:text-amber-500/70">
        {intl.formatMessage(
          {
            id: 'portal.moderation.hiddenFromCustomers',
            defaultMessage: 'Customers cannot see this {noun} yet.',
          },
          { noun: nounLabel }
        )}
      </span>
      {canAct && (
        <span className="ms-auto flex shrink-0 gap-1.5">
          {onApprove && (
            <Button size="sm" onClick={onApprove} disabled={busy}>
              {intl.formatMessage({
                id: 'portal.moderation.card.approve',
                defaultMessage: 'Approve',
              })}
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
              {intl.formatMessage({
                id: 'portal.moderation.card.reject',
                defaultMessage: 'Reject',
              })}
            </Button>
          )}
        </span>
      )}
    </div>
  )
}
