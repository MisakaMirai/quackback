import { Link } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { Button } from '@/components/ui/button'
import type { LaunchTask } from '@/lib/shared/launch-checklist'

/**
 * The launch plan's branding step: upload a logo in Settings.
 */
export function BrandingStepAction({
  task,
  variant,
}: {
  task: LaunchTask
  variant: 'default' | 'outline'
}) {
  if (!task.href) return null
  return (
    <div className="order-last flex basis-full flex-wrap items-center gap-2 ps-8">
      <Button asChild size="sm" variant={variant}>
        <Link to={task.href} search={task.search as never}>
          <FormattedMessage id="onboarding.branding.upload" defaultMessage="Upload a logo" />
        </Link>
      </Button>
    </div>
  )
}
