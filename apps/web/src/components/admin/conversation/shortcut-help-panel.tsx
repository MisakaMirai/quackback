/**
 * The inbox shortcut help panel (support platform §4.6): the `?` cheatsheet. It
 * derives every row from INBOX_ACTIONS (the action keys) plus the hook's
 * INBOX_GLOBAL_SHORTCUTS (Cmd-K / ?), so it can never list a key nothing binds.
 */
import { memo } from 'react'
import { INBOX_ACTIONS, INBOX_ACTION_GROUP_ORDER } from '@/lib/shared/conversation/inbox-actions'
import { INBOX_GLOBAL_SHORTCUTS } from './use-inbox-keyboard'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-foreground">{label}</span>
      <kbd className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
        {keys}
      </kbd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <div className="divide-border divide-y">{children}</div>
    </section>
  )
}

export const ShortcutHelpPanel = memo(function ShortcutHelpPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const intl = useOptionalIntl()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.inbox.shortcuts.title',
              defaultMessage: 'Keyboard shortcuts',
            })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.inbox.shortcuts.description',
              defaultMessage: 'Work the inbox without leaving the keyboard.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section
            title={intl.formatMessage({
              id: 'admin.inbox.shortcuts.general',
              defaultMessage: 'General',
            })}
          >
            {INBOX_GLOBAL_SHORTCUTS.map((s) => (
              <ShortcutRow key={s.keys} keys={s.keys} label={s.label} />
            ))}
          </Section>
          {INBOX_ACTION_GROUP_ORDER.map((group) => {
            const rows = INBOX_ACTIONS.filter((a) => a.group === group && a.shortcut)
            if (rows.length === 0) return null
            return (
              <Section key={group} title={group}>
                {rows.map((a) => (
                  <ShortcutRow key={a.id} keys={a.shortcut!} label={a.label} />
                ))}
              </Section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
})
