import { cn } from '@/lib/shared/utils'
import { MENU_LABEL } from '@/components/ui/menu'

/**
 * The canonical admin left-pane subheading. Pass `action` to render a control
 * (e.g. a create button) on the right. Used by every admin filter/nav pane so
 * subheadings read identically across the app.
 */
export function FilterSection({
  title,
  children,
  hint,
  action,
}: {
  title: string
  children: React.ReactNode
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="pb-4 last:pb-0">
      <div className="flex w-full items-center justify-between">
        <span className={cn('py-1', MENU_LABEL)}>{title}</span>
        {action}
      </div>
      <div className="mt-0.5">
        {children}
        {hint && <p className="mt-2 text-xs text-muted-foreground/60">{hint}</p>}
      </div>
    </div>
  )
}
