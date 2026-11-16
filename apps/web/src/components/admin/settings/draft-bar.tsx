import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

interface DraftBarProps {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

/**
 * Floating save bar for pages with a live preview, where changes are reviewed
 * before they apply. Every other settings page autosaves.
 */
export const DraftBar = memo(function DraftBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: DraftBarProps) {
  const intl = useOptionalIntl()
  if (!dirty) return null
  return (
    <div
      data-slot="draft-bar"
      role="status"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full bg-neutral-950 py-2 pl-4 pr-2 text-[13.5px] text-white shadow-lg"
    >
      <span>
        {intl.formatMessage({
          id: 'admin.settings.draftBar.unsavedChanges',
          defaultMessage: 'Unsaved changes',
        })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDiscard}
        disabled={saving}
        className="text-neutral-300 hover:bg-white/10 hover:text-white"
      >
        {intl.formatMessage({ id: 'admin.settings.draftBar.discard', defaultMessage: 'Discard' })}
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving
          ? intl.formatMessage({
              id: 'admin.settings.draftBar.saving',
              defaultMessage: 'Saving…',
            })
          : intl.formatMessage({ id: 'admin.settings.draftBar.save', defaultMessage: 'Save' })}
      </Button>
    </div>
  )
})
