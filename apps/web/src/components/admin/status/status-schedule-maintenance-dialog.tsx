/**
 * Schedule maintenance — its own dialog rather than a mode of the incident
 * form, so maintenance-only fields (window, automation) never crowd the
 * incident fast path and vice versa.
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Route } from '@/routes/admin/status'
import { useCreateStatusIncident } from '@/lib/client/mutations/status'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  AffectedComponentsField,
  TemplatePickerButton,
  templateToAffectedRows,
  type AffectedRow,
} from './status-incident-fields'
import { toastError } from '@/lib/client/error-notice'

export function ScheduleMaintenanceDialog({
  variant = 'outline',
}: {
  variant?: 'default' | 'outline'
}) {
  const intl = useOptionalIntl()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const createMutation = useCreateStatusIncident()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [affected, setAffected] = useState<AffectedRow[]>([])
  // Provenance: which template seeded this window, if any (survives later edits).
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [scheduledStart, setScheduledStart] = useState<Date | undefined>(undefined)
  const [scheduledEnd, setScheduledEnd] = useState<Date | undefined>(undefined)
  const [autoStart, setAutoStart] = useState(true)
  const [autoComplete, setAutoComplete] = useState(true)
  const [notify, setNotify] = useState(true)

  function reset() {
    setTitle('')
    setBody('')
    setAffected([])
    setTemplateId(null)
    setScheduledStart(undefined)
    setScheduledEnd(undefined)
    setAutoStart(true)
    setAutoComplete(true)
    setNotify(true)
    createMutation.reset()
  }

  // The window bounds are required: a date-less window with autoStart on
  // would sit in 'scheduled' forever (no job is ever enqueued for a null
  // start bound).
  const windowOutOfOrder =
    !!scheduledStart && !!scheduledEnd && scheduledEnd.getTime() <= scheduledStart.getTime()
  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    affected.length > 0 &&
    !!scheduledStart &&
    !!scheduledEnd &&
    !windowOutOfOrder

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      const created = await createMutation.mutateAsync({
        kind: 'maintenance',
        title: title.trim(),
        status: 'scheduled',
        ...(templateId ? { templateId } : {}),
        affectedComponents: affected,
        body: body.trim(),
        scheduledStartAt: scheduledStart ?? null,
        scheduledEndAt: scheduledEnd ?? null,
        autoStart,
        autoComplete,
        notifySubscribers: notify,
      })
      setOpen(false)
      reset()
      void navigate({
        to: '/admin/status',
        search: { ...search, view: 'maintenance', incident: created.id },
      })
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.schedule.toastFailed',
          defaultMessage: 'Failed to schedule maintenance',
        })
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          {intl.formatMessage({
            id: 'admin.status.schedule.action',
            defaultMessage: 'Schedule maintenance',
          })}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.status.schedule.action',
              defaultMessage: 'Schedule maintenance',
            })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.status.schedule.description',
              defaultMessage:
                'Appears on your status page and emails subscribers once, when scheduled.',
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maint-title">
                {intl.formatMessage({ id: 'admin.status.field.title', defaultMessage: 'Title' })}
              </Label>
              <TemplatePickerButton
                label={intl.formatMessage({
                  id: 'admin.status.action.startFromTemplate',
                  defaultMessage: 'Start from template',
                })}
                onApply={(t) => {
                  setTitle(t.title)
                  setBody(t.body)
                  setAffected(templateToAffectedRows(t.componentIds, 'maintenance'))
                  setTemplateId(t.id)
                }}
              />
            </div>
            <Input
              id="maint-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.status.schedule.titlePlaceholder',
                defaultMessage: 'Database maintenance window',
              })}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maint-body">
              {intl.formatMessage({
                id: 'admin.status.schedule.bodyLabel',
                defaultMessage: "What's planned?",
              })}
            </Label>
            <Textarea
              id="maint-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.status.schedule.bodyPlaceholder',
                defaultMessage:
                  "What's happening during this window, and what should users expect?",
              })}
              className="min-h-20"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                {intl.formatMessage({
                  id: 'admin.status.field.scheduledStart',
                  defaultMessage: 'Scheduled start',
                })}
              </Label>
              <DateTimePicker
                value={scheduledStart}
                onChange={setScheduledStart}
                minDate={new Date()}
              />
            </div>
            <div className="space-y-2">
              <Label>
                {intl.formatMessage({
                  id: 'admin.status.field.scheduledEnd',
                  defaultMessage: 'Scheduled end',
                })}
              </Label>
              {/* No minDate: the picker would move an end before the start up
                  to the start. The admin's value stays, with the error below. */}
              <DateTimePicker value={scheduledEnd} onChange={setScheduledEnd} />
            </div>
            {windowOutOfOrder && (
              <p className="col-span-2 text-xs text-destructive">
                {intl.formatMessage({
                  id: 'admin.status.field.endAfterStart',
                  defaultMessage: 'The end must be after the start.',
                })}
              </p>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={autoStart} onCheckedChange={setAutoStart} />
              {intl.formatMessage({
                id: 'admin.status.field.autoStart',
                defaultMessage: 'Auto-start at scheduled time',
              })}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={autoComplete} onCheckedChange={setAutoComplete} />
              {intl.formatMessage({
                id: 'admin.status.field.autoComplete',
                defaultMessage: 'Auto-complete at end time',
              })}
            </label>
          </div>

          <div className="space-y-2">
            <Label>
              {intl.formatMessage({
                id: 'admin.status.field.affectedServices',
                defaultMessage: 'Affected services',
              })}
            </Label>
            <AffectedComponentsField kind="maintenance" value={affected} onChange={setAffected} />
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.status.schedule.affectedHint',
                defaultMessage:
                  'Services switch to Under maintenance while the window runs, then restore.',
              })}
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={notify}
              onCheckedChange={(c) => setNotify(c === true)}
              className="mt-0.5"
              data-in-label
            />
            <span className="text-sm">
              {intl.formatMessage({
                id: 'admin.status.field.emailSubscribers',
                defaultMessage: 'Email subscribers',
              })}
              <span className="block text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.status.schedule.emailHint',
                  defaultMessage:
                    'One email when this is scheduled. Start, progress, and completion never email.',
                })}
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending
                ? intl.formatMessage({
                    id: 'admin.status.schedule.submitting',
                    defaultMessage: 'Scheduling…',
                  })
                : intl.formatMessage({
                    id: 'admin.status.schedule.action',
                    defaultMessage: 'Schedule maintenance',
                  })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
