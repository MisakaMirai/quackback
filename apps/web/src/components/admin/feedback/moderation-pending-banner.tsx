import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheckIcon } from '@heroicons/react/24/solid'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { adminQueries } from '@/lib/client/queries/admin'

export function ModerationPendingBanner() {
  const intl = useOptionalIntl()
  const { data } = useQuery(adminQueries.moderationStatus())
  const pendingCount = data?.pendingCount ?? 0
  if (pendingCount <= 0) return null

  const label = intl.formatMessage(
    {
      id: 'admin.feedback.moderation.pending',
      defaultMessage: '{count, plural, one {# item is} other {# items are}} pending moderation',
    },
    { count: pendingCount }
  )

  return (
    <div className="max-w-5xl w-full px-3 pt-3">
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm">
        <ShieldCheckIcon className="h-4 w-4 text-primary shrink-0" />
        <span className="text-foreground">{label}</span>
        <Link
          to="/admin/feedback/moderation"
          className="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-medium"
        >
          Review
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
