import { MagnifyingGlassIcon, DocumentIcon, SparklesIcon } from '@heroicons/react/24/solid'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { useActivationAction } from '@/lib/client/hooks/use-activation-action'
import { ActivationActionButton } from '@/components/admin/activation-action-button'
import { useUserRole } from '@/lib/client/hooks/use-root-context'

interface InboxEmptyStateProps {
  type: 'no-posts' | 'no-results' | 'no-selection'
  onClearFilters?: () => void
}

export function InboxEmptyState({ type, onClearFilters }: InboxEmptyStateProps) {
  const intl = useOptionalIntl()
  const userRole = useUserRole()
  const activationAction = useActivationAction('feedback_empty')
  const isAdmin = userRole === 'admin'

  if (type === 'no-results') {
    return (
      <EmptyState
        icon={MagnifyingGlassIcon}
        title={intl.formatMessage({
          id: 'admin.feedback.empty.noResultsTitle',
          defaultMessage: 'No results for these filters',
        })}
        description={intl.formatMessage({
          id: 'admin.feedback.empty.noResultsDescription',
          defaultMessage: 'Try adjusting your search or filter criteria.',
        })}
        action={
          onClearFilters && (
            <Button variant="outline" onClick={onClearFilters}>
              {intl.formatMessage({
                id: 'admin.helpCenter.finder.clearFilters',
                defaultMessage: 'Clear all filters',
              })}
            </Button>
          )
        }
      />
    )
  }

  if (type === 'no-posts') {
    return (
      <div data-tour="feedback-empty">
        <EmptyState
          icon={SparklesIcon}
          title={intl.formatMessage({
            id: 'onboarding.feedback.empty',
            defaultMessage: 'No posts yet',
          })}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {isAdmin && activationAction && (
                <ActivationActionButton
                  action={activationAction}
                  surface="feedback_empty"
                  className="h-11 sm:h-9"
                />
              )}
            </div>
          }
        />
      </div>
    )
  }

  // no-selection
  return (
    <EmptyState
      icon={DocumentIcon}
      title={intl.formatMessage({
        id: 'admin.feedback.empty.selectPostTitle',
        defaultMessage: 'Select a post',
      })}
      description={intl.formatMessage({
        id: 'admin.feedback.empty.selectPostDescription',
        defaultMessage: 'Choose a post from the list to view its details.',
      })}
      className="h-full"
    />
  )
}
