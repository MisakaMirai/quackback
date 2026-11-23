/**
 * The ticket-types registry manager (convergence Phase 4,
 * scratchpad/convergence-design.md): the workspace's user-defined ticket
 * kinds. A type is a label + icon + color + typed field set WITHIN one of the
 * three fixed categories; the category drives behavior (cascade rules, portal
 * visibility, SLA), the type defines the fields a ticket captures.
 *
 * List + create/edit dialog (identity + the DnD field editor per type, which
 * lives in ./fields-editor.tsx) + archive/restore. Archive-not-delete: in-use
 * types stay on ticket history forever. Permission `ticket.manage_types` is
 * enforced by the route and re-checked by every server fn.
 */
import { useEffect, useState } from 'react'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TicketIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { RowIcon, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ColorPickerGrid, ColorHexInput, randomColor } from '@/components/shared/color-picker'
import { TICKET_TYPES } from '@/lib/shared/db-types'
import type { TicketType } from '@/lib/shared/db-types'
import type { TicketFormField, TicketTypeDTO } from '@/lib/shared/tickets'
import { ticketTypeLabel } from '@/components/admin/inbox/ticket-chips'
import {
  createTicketTypeFn,
  updateTicketTypeFn,
  archiveTicketTypeFn,
  restoreTicketTypeFn,
} from '@/lib/server/functions/ticket-types'
import { ticketTypesQuery } from './queries'
import { FieldsEditor } from './fields-editor'
import { errorText } from '@/lib/client/error-text'
import { toastError } from '@/lib/client/error-notice'

/** Category presentation for the registry rows (label comes from the shared
 *  ticketTypeLabel so the inbox chips can't drift). */
const CATEGORY_NOTE: Record<TicketType, { id: string; defaultMessage: string }> = {
  customer: {
    id: 'admin.settings.ticketTypes.categoryNote.customer',
    defaultMessage: 'Customers submit these from the portal and Messenger.',
  },
  back_office: {
    id: 'admin.settings.ticketTypes.categoryNote.backOffice',
    defaultMessage: 'Internal only, customers never see them.',
  },
  tracker: {
    id: 'admin.settings.ticketTypes.categoryNote.tracker',
    defaultMessage: 'Internal work item. Status changes cascade to linked tickets.',
  },
}

export function TicketTypesManager({
  creating,
  onCreatingChange,
}: {
  /** The page header's "New type" button opens the editor for a fresh type. */
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}) {
  const qc = useQueryClient()
  const intl = useOptionalIntl()
  const { data: types } = useSuspenseQuery(ticketTypesQuery)

  const [editing, setEditing] = useState<TicketTypeDTO | null>(null)
  const dialogOpen = creating || editing !== null
  const [toArchive, setToArchive] = useState<TicketTypeDTO | null>(null)

  const live = types.filter((t) => !t.archived)
  const archived = types.filter((t) => t.archived)

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ticketTypesQuery.queryKey })
  }

  async function handleArchive() {
    if (!toArchive) return
    try {
      await archiveTicketTypeFn({ data: { id: toArchive.id } })
      toast.success(
        intl.formatMessage(
          {
            id: 'admin.settings.ticketTypes.archivedToast',
            defaultMessage: 'Archived "{name}"',
          },
          { name: toArchive.name }
        )
      )
      await refresh()
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.ticketTypes.archiveFailed',
          defaultMessage: 'Failed to archive type',
        })
      )
    } finally {
      setToArchive(null)
    }
  }

  async function handleRestore(type: TicketTypeDTO) {
    try {
      await restoreTicketTypeFn({ data: { id: type.id } })
      toast.success(
        intl.formatMessage(
          {
            id: 'admin.settings.ticketTypes.restoredToast',
            defaultMessage: 'Restored "{name}"',
          },
          { name: type.name }
        )
      )
      await refresh()
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.ticketTypes.restoreFailed',
          defaultMessage: 'Failed to restore type',
        })
      )
    }
  }

  return (
    <SettingsCard flush>
      <div className="divide-y divide-border/40">
        {TICKET_TYPES.map((category) => {
          const group = live.filter((t) => t.category === category)
          if (group.length === 0) return null
          return (
            <div key={category}>
              <div className="px-4 sm:px-6 pt-4 pb-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {ticketTypeLabel(category)}
                  <span className="font-normal">
                    {' · '}
                    {intl.formatMessage(CATEGORY_NOTE[category])}
                  </span>
                </p>
              </div>
              <SettingsList>
                {group.map((type) => (
                  <TypeRow
                    key={type.id}
                    type={type}
                    onEdit={() => setEditing(type)}
                    onArchive={() => setToArchive(type)}
                  />
                ))}
              </SettingsList>
            </div>
          )
        })}

        {archived.length > 0 && (
          <div>
            <div className="px-4 sm:px-6 pt-4 pb-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.ticketTypes.archived',
                  defaultMessage: 'Archived',
                })}
                <span className="font-normal">
                  {' · '}
                  {intl.formatMessage({
                    id: 'admin.settings.ticketTypes.archivedNote',
                    defaultMessage: 'kept on ticket history, hidden from pickers.',
                  })}
                </span>
              </p>
            </div>
            <SettingsList>
              {archived.map((type) => (
                <TypeRow key={type.id} type={type} onRestore={() => handleRestore(type)} />
              ))}
            </SettingsList>
          </div>
        )}
      </div>

      <TypeEditorDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            onCreatingChange(false)
          }
        }}
        type={editing}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={() => setToArchive(null)}
        title={intl.formatMessage({
          id: 'admin.settings.ticketTypes.archiveTitle',
          defaultMessage: 'Archive type?',
        })}
        description={intl.formatMessage(
          {
            id: 'admin.settings.ticketTypes.archiveDescription',
            defaultMessage:
              'Archive "{name}"? It stays on existing tickets but leaves every picker. You can restore it later.',
          },
          { name: toArchive?.name ?? '' }
        )}
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.ticketTypes.archiveConfirm',
          defaultMessage: 'Archive type',
        })}
        onConfirm={handleArchive}
      />
    </SettingsCard>
  )
}

interface TypeRowProps {
  type: TicketTypeDTO
  onEdit?: () => void
  onArchive?: () => void
  onRestore?: () => void
}

function TypeRow({ type, onEdit, onArchive, onRestore }: TypeRowProps) {
  const intl = useOptionalIntl()
  const fieldSummary =
    type.fields.length === 0
      ? intl.formatMessage({
          id: 'admin.settings.ticketTypes.emptyFields',
          defaultMessage: 'No custom fields',
        })
      : `${intl.formatMessage(
          {
            id: 'admin.settings.ticketTypes.fieldCount',
            defaultMessage: '{count, plural, one {# field} other {# fields}}',
          },
          { count: type.fields.length }
        )} · ${type.fields
          .slice(0, 5)
          .map((f) => f.label)
          .join(', ')}${type.fields.length > 5 ? ', …' : ''}`
  const actions = onRestore
    ? [
        {
          label: intl.formatMessage({
            id: 'admin.settings.ticketTypes.restore',
            defaultMessage: 'Restore',
          }),
          onSelect: onRestore,
        },
      ]
    : [
        ...(onEdit
          ? [
              {
                label: intl.formatMessage({
                  id: 'admin.settings.ticketTypes.edit',
                  defaultMessage: 'Edit',
                }),
                onSelect: onEdit,
              },
            ]
          : []),
        ...(onArchive
          ? [
              {
                label: intl.formatMessage({
                  id: 'admin.settings.ticketTypes.archive',
                  defaultMessage: 'Archive',
                }),
                onSelect: onArchive,
              },
            ]
          : []),
      ]
  return (
    <SettingsListRow
      leading={
        type.icon ? (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: `${type.color}1f` }}
            aria-hidden
          >
            {type.icon}
          </span>
        ) : (
          <RowIcon icon={TicketIcon} />
        )
      }
      title={type.name}
      meta={
        fieldSummary +
        (type.ticketCount !== undefined && type.ticketCount > 0
          ? ` · ${intl.formatMessage(
              {
                id: 'admin.settings.ticketTypes.ticketCount',
                defaultMessage: '{count, plural, one {# ticket} other {# tickets}}',
              },
              { count: type.ticketCount }
            )}`
          : '')
      }
      badges={
        <>
          {type.category !== 'customer' && (
            <Badge variant="subtle">
              {intl.formatMessage({
                id: 'admin.settings.ticketTypes.internal',
                defaultMessage: 'Internal',
              })}
            </Badge>
          )}
          {type.archived && (
            <Badge variant="subtle">
              {intl.formatMessage({
                id: 'admin.settings.ticketTypes.archived',
                defaultMessage: 'Archived',
              })}
            </Badge>
          )}
        </>
      }
      actions={actions}
    />
  )
}

// ---------------------------------------------------------------------------
// Type editor dialog — identity + the DnD field editor
// ---------------------------------------------------------------------------

interface TypeEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null = creating. */
  type: TicketTypeDTO | null
  onSaved: () => Promise<void>
}

function TypeEditorDialog({ open, onOpenChange, type, onSaved }: TypeEditorDialogProps) {
  const intl = useOptionalIntl()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState<TicketType>('customer')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState(randomColor())
  const [intakeVisible, setIntakeVisible] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [fields, setFields] = useState<TicketFormField[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editing = type !== null
  // CATEGORY LOCK: once tickets reference the type its category is fixed:
  // recategorizing would silently rewrite behavior on ticket history.
  const categoryLocked = editing && (type.ticketCount ?? 0) > 0
  // The live default can't be unset directly (the category must always resolve
  // a default); promote another type instead.
  const defaultLocked = editing && type.isDefault && !type.archived

  useEffect(() => {
    if (!open) return
    setError(null)
    if (type) {
      setName(type.name)
      setSlug(type.slug)
      setCategory(type.category)
      setIcon(type.icon ?? '')
      setColor(type.color)
      setIntakeVisible(type.intakeVisible)
      setIsDefault(type.isDefault)
      setFields(type.fields)
    } else {
      setName('')
      setSlug('')
      setCategory('customer')
      setIcon('')
      setColor(randomColor())
      setIntakeVisible(true)
      setIsDefault(false)
      setFields([])
    }
  }, [open, type])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const ordered = fields.map((f, i) => ({ ...f, order: i }))
      if (editing) {
        await updateTicketTypeFn({
          data: {
            id: type.id,
            name: name.trim(),
            slug: slug.trim() || undefined,
            ...(categoryLocked ? {} : { category }),
            icon: icon.trim() || null,
            color,
            intakeVisible,
            ...(defaultLocked ? {} : { isDefault }),
            fields: ordered,
          },
        })
        toast.success(
          intl.formatMessage(
            {
              id: 'admin.settings.ticketTypes.savedToast',
              defaultMessage: 'Saved "{name}"',
            },
            { name: name.trim() }
          )
        )
      } else {
        await createTicketTypeFn({
          data: {
            name: name.trim(),
            category,
            slug: slug.trim() || undefined,
            icon: icon.trim() || null,
            color,
            intakeVisible,
            isDefault,
            fields: ordered,
          },
        })
        toast.success(
          intl.formatMessage(
            {
              id: 'admin.settings.ticketTypes.createdToast',
              defaultMessage: 'Created "{name}"',
            },
            { name: name.trim() }
          )
        )
      }
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.settings.ticketTypes.saveFailed',
            defaultMessage: 'Failed to save type',
          })
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? intl.formatMessage({
                  id: 'admin.settings.ticketTypes.editTitle',
                  defaultMessage: 'Edit type',
                })
              : intl.formatMessage({
                  id: 'admin.settings.ticketTypes.newTitle',
                  defaultMessage: 'New type',
                })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.settings.ticketTypes.dialogDescription',
              defaultMessage: 'Behavior comes from the category; fields are yours.',
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticket-type-name">
                {intl.formatMessage({
                  id: 'admin.settings.ticketTypes.nameLabel',
                  defaultMessage: 'Name',
                })}
              </Label>
              <Input
                id="ticket-type-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder={intl.formatMessage({
                  id: 'admin.settings.ticketTypes.namePlaceholder',
                  defaultMessage: 'e.g. Bug report',
                })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-type-slug">
                {intl.formatMessage({
                  id: 'admin.settings.ticketTypes.slugLabel',
                  defaultMessage: 'Slug',
                })}
              </Label>
              <Input
                id="ticket-type-slug"
                value={slug}
                maxLength={64}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={intl.formatMessage({
                  id: 'admin.settings.ticketTypes.slugPlaceholder',
                  defaultMessage: 'auto-generated from name',
                })}
              />
              <p className="text-[11px] text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.ticketTypes.slugHint',
                  defaultMessage:
                    'Lowercase letters, digits, underscores. Stable key for API + workflows.',
                })}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                {intl.formatMessage({
                  id: 'admin.settings.ticketTypes.categoryLabel',
                  defaultMessage: 'Category',
                })}
              </Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as TicketType)}
                disabled={categoryLocked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {ticketTypeLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoryLocked && (
                <p className="text-[11px] text-muted-foreground">
                  {intl.formatMessage(
                    {
                      id: 'admin.settings.ticketTypes.categoryLockedHint',
                      defaultMessage:
                        'Locked: {count, plural, one {# ticket} other {# tickets}} use this type. Archive it and create a new type instead.',
                    },
                    { count: type?.ticketCount ?? 0 }
                  )}
                </p>
              )}
            </div>
            <div className="grid grid-cols-[64px_1fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="ticket-type-icon">
                  {intl.formatMessage({
                    id: 'admin.settings.ticketTypes.iconLabel',
                    defaultMessage: 'Icon',
                  })}
                </Label>
                <Input
                  id="ticket-type-icon"
                  value={icon}
                  maxLength={16}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🐛"
                  className="text-center"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {intl.formatMessage({
                    id: 'admin.settings.ticketTypes.colorLabel',
                    defaultMessage: 'Color',
                  })}
                </Label>
                <ColorHexInput color={color} onColorChange={setColor} />
              </div>
            </div>
          </div>

          <ColorPickerGrid selectedColor={color} onColorChange={setColor} />

          <SettingRows>
            {category === 'customer' && (
              <SettingRow
                label={intl.formatMessage({
                  id: 'admin.settings.ticketTypes.intakeLabel',
                  defaultMessage: 'Show on portal and Messenger intake',
                })}
                htmlFor="ticket-type-intake"
                control={
                  <Switch
                    id="ticket-type-intake"
                    checked={intakeVisible}
                    onCheckedChange={setIntakeVisible}
                  />
                }
              />
            )}
            <SettingRow
              label={intl.formatMessage(
                {
                  id: 'admin.settings.ticketTypes.defaultFor',
                  defaultMessage: 'Default for {category} tickets',
                },
                { category: ticketTypeLabel(category) }
              )}
              description={
                defaultLocked
                  ? intl.formatMessage({
                      id: 'admin.settings.ticketTypes.defaultLockedDescription',
                      defaultMessage:
                        'This is the category default. Set another type as default to change it.',
                    })
                  : undefined
              }
              htmlFor="ticket-type-default"
              control={
                <Switch
                  id="ticket-type-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  disabled={defaultLocked}
                />
              }
            />
          </SettingRows>

          <FieldsEditor category={category} fields={fields} onChange={setFields} />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting
                ? intl.formatMessage({
                    id: 'admin.settings.ticketTypes.saving',
                    defaultMessage: 'Saving…',
                  })
                : editing
                  ? intl.formatMessage({
                      id: 'admin.settings.ticketTypes.saveChanges',
                      defaultMessage: 'Save changes',
                    })
                  : intl.formatMessage({
                      id: 'admin.settings.ticketTypes.createType',
                      defaultMessage: 'Create type',
                    })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
