import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { cn } from '@/lib/shared/utils'

interface PortalPrivacyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

const PRIVATE_CONSEQUENCES = [
  {
    headingId: 'admin.settings.portalPrivacy.publicVisitorsHeading',
    heading: 'Public visitors lose access.',
    bodyId: 'admin.settings.portalPrivacy.publicVisitorsBody',
    body: 'Anyone who could view the portal without an account will no longer be able to. Your team is not affected.',
  },
  {
    headingId: 'admin.settings.portalPrivacy.searchHeading',
    heading: 'Search engines stop indexing it.',
    bodyId: 'admin.settings.portalPrivacy.searchBody',
    body: 'A private portal is removed from search results, and pages that are already indexed will drop over time.',
  },
  {
    headingId: 'admin.settings.portalPrivacy.accessHeading',
    heading: 'You must grant access.',
    bodyId: 'admin.settings.portalPrivacy.accessBody',
    body: 'Configure who can get in, such as allowed email domains, or external users will not be able to reach the portal.',
  },
]

export function PortalPrivacyDialog({ open, onOpenChange, onConfirm }: PortalPrivacyDialogProps) {
  const intl = useOptionalIntl()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {intl.formatMessage({
              id: 'admin.settings.portalPrivacy.title',
              defaultMessage: 'Make this portal private?',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {intl.formatMessage({
                  id: 'admin.settings.portalPrivacy.intro',
                  defaultMessage: 'Switching to private has the following effects:',
                })}
              </p>
              <ul className="space-y-2">
                {PRIVATE_CONSEQUENCES.map(({ headingId, heading, bodyId, body }) => (
                  <li key={headingId} className="text-sm">
                    <span className="font-medium text-foreground">
                      {intl.formatMessage({ id: headingId, defaultMessage: heading })}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {intl.formatMessage({ id: bodyId, defaultMessage: body })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'destructive' }))}
            onClick={onConfirm}
          >
            {intl.formatMessage({
              id: 'admin.settings.portalPrivacy.confirm',
              defaultMessage: 'Make private',
            })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
