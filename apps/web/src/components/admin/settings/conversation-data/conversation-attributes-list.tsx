/**
 * Conversation attributes registry manager (Settings > Conversations >
 * Attributes). Rows and the card come from the shared AttributeList; one form
 * dialog is reused for create + edit. Registry semantics enforced here in the form: key and field type lock after creation, select
 * options can be renamed or appended but never removed (values store option
 * ids), lifecycle is archive/restore only.
 */
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid'
import type { ConversationAttributeId } from '@quackback/ids'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { AttributeList, type AttributeListItem } from '@/components/admin/settings/attribute-list'
import { Badge } from '@/components/ui/badge'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import {
  createConversationAttributeFn,
  updateConversationAttributeFn,
  archiveConversationAttributeFn,
  restoreConversationAttributeFn,
} from '@/lib/server/functions/conversation-attributes'
import {
  conversationAttributeQueries,
  type ConversationAttributeItem,
} from '@/lib/client/queries/conversation-attributes'
import { toastError } from '@/lib/client/error-notice'

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
] as const

type FieldType = (typeof FIELD_TYPES)[number]['value']

const SOURCE_HINTS = [
  { value: 'agent', label: 'Agent', usually: 'an agent' },
  { value: 'workflow', label: 'Workflow', usually: 'a workflow' },
] as const

const isSelectType = (t: FieldType) => t === 'select' || t === 'multi_select'

interface OptionDraft {
  /** Present for saved options (rename-only); absent for a newly added one. */
  id?: string
  label: string
  description: string
}

interface AttributeFormValues {
  key: string
  label: string
  description: string
  fieldType: FieldType
  options: OptionDraft[]
  requiredToClose: boolean
  sourceHint: string
}

function AttributeFormDialog({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues?: Partial<AttributeFormValues> & { id?: ConversationAttributeId }
  onSubmit: (values: AttributeFormValues) => Promise<void>
  isPending?: boolean
}) {
  const isEditing = !!initialValues?.id

  const [key, setKey] = useState(initialValues?.key ?? '')
  const [label, setLabel] = useState(initialValues?.label ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [fieldType, setFieldType] = useState<FieldType>(initialValues?.fieldType ?? 'text')
  const [options, setOptions] = useState<OptionDraft[]>(initialValues?.options ?? [])
  const [requiredToClose, setRequiredToClose] = useState(initialValues?.requiredToClose ?? false)
  const [sourceHint, setSourceHint] = useState(initialValues?.sourceHint ?? 'none')

  useEffect(() => {
    if (open) {
      setKey(initialValues?.key ?? '')
      setLabel(initialValues?.label ?? '')
      setDescription(initialValues?.description ?? '')
      setFieldType(initialValues?.fieldType ?? 'text')
      setOptions(initialValues?.options ?? [])
      setRequiredToClose(initialValues?.requiredToClose ?? false)
      setSourceHint(initialValues?.sourceHint ?? 'none')
    }
  }, [open])

  const updateOption = (index: number, patch: Partial<OptionDraft>) =>
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))

  const filledOptions = options.filter((o) => o.label.trim().length > 0)

  const canSubmit =
    key.trim().length > 0 &&
    label.trim().length > 0 &&
    (!isSelectType(fieldType) || filledOptions.length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      key,
      label,
      description,
      fieldType,
      options: isSelectType(fieldType) ? filledOptions : [],
      requiredToClose,
      sourceHint,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit attribute' : 'New conversation attribute'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conv-attr-key">Key</Label>
            <Input
              id="conv-attr-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="issue_type"
              disabled={isEditing}
              className={isEditing ? 'text-muted-foreground' : ''}
              required
            />
            {!isEditing && (
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers, underscores only. Cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conv-attr-label">Display label</Label>
            <Input
              id="conv-attr-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Issue type"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={fieldType}
              onValueChange={(v) => setFieldType(v as FieldType)}
              disabled={isEditing}
            >
              <SelectTrigger className={isEditing ? 'text-muted-foreground' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditing && (
              <p className="text-[11px] text-muted-foreground">The type is fixed after creation.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conv-attr-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="conv-attr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this attribute captures."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {isSelectType(fieldType) && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="space-y-2">
                {options.map((option, i) => (
                  <div key={option.id ?? `new-${i}`} className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1">
                      <Input
                        value={option.label}
                        onChange={(e) => updateOption(i, { label: e.target.value })}
                        placeholder="Option label"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={option.description}
                        onChange={(e) => updateOption(i, { description: e.target.value })}
                        placeholder="Description (optional)"
                        className="h-8 text-xs"
                      />
                    </div>
                    {/* Saved options can only be renamed: stored values
                        reference their ids, so removal is not offered. */}
                    {option.id === undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                        title="Remove option"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setOptions((prev) => [...prev, { label: '', description: '' }])}
                >
                  <PlusIcon className="h-3 w-3" /> Add option
                </Button>
              </div>
              {isEditing && (
                <p className="text-[11px] text-muted-foreground">
                  Existing options can be renamed but not removed, because stored values reference
                  them.
                </p>
              )}
            </div>
          )}

          <SettingRows>
            <SettingRow
              label="Required to close"
              description="Teammates must fill this before closing a conversation. Automations are exempt."
              htmlFor="attr-required-to-close"
              control={
                <Switch
                  id="attr-required-to-close"
                  checked={requiredToClose}
                  onCheckedChange={setRequiredToClose}
                />
              }
            />
          </SettingRows>

          <div className="space-y-1.5">
            <Label>
              Usually set by <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select value={sourceHint} onValueChange={setSourceHint}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No hint</SelectItem>
                {SOURCE_HINTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Save changes' : 'Create attribute'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ConversationAttributesList() {
  const queryClient = useQueryClient()
  const registryQuery = useSuspenseQuery(conversationAttributeQueries.registry())
  const attributes = registryQuery.data

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'conversation-attributes'] })

  const createAttr = useMutation({
    mutationFn: (input: Parameters<typeof createConversationAttributeFn>[0]['data']) =>
      createConversationAttributeFn({ data: input }),
    onSuccess: invalidate,
    onError: (e) => toastError(e, 'Failed to create attribute'),
  })
  const updateAttr = useMutation({
    mutationFn: (input: Parameters<typeof updateConversationAttributeFn>[0]['data']) =>
      updateConversationAttributeFn({ data: input }),
    onSuccess: invalidate,
    onError: (e) => toastError(e, 'Failed to update attribute'),
  })
  const archiveAttr = useMutation({
    mutationFn: (id: ConversationAttributeId) => archiveConversationAttributeFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toastError(e, 'Failed to archive attribute'),
  })
  const restoreAttr = useMutation({
    mutationFn: (id: ConversationAttributeId) => restoreConversationAttributeFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toastError(e, 'Failed to restore attribute'),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ConversationAttributeItem | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ConversationAttributeItem | null>(null)

  const handleCreate = async (values: AttributeFormValues) => {
    await createAttr.mutateAsync({
      key: values.key,
      label: values.label,
      description: values.description || undefined,
      fieldType: values.fieldType,
      options: isSelectType(values.fieldType)
        ? values.options.map((o) => ({
            label: o.label.trim(),
            description: o.description.trim() || undefined,
          }))
        : undefined,
      requiredToClose: values.requiredToClose,
      sourceHint:
        values.sourceHint === 'none'
          ? undefined
          : (values.sourceHint as 'ai' | 'workflow' | 'agent'),
    })
    setCreateOpen(false)
  }

  const handleUpdate = async (values: AttributeFormValues) => {
    if (!editTarget) return
    await updateAttr.mutateAsync({
      id: editTarget.id,
      label: values.label,
      description: values.description || null,
      options: isSelectType(values.fieldType)
        ? values.options.map((o) => ({
            id: o.id,
            label: o.label.trim(),
            description: o.description.trim() || undefined,
          }))
        : undefined,
      requiredToClose: values.requiredToClose,
      sourceHint:
        values.sourceHint === 'none' ? null : (values.sourceHint as 'ai' | 'workflow' | 'agent'),
    })
    setEditTarget(null)
  }

  const handleArchive = async () => {
    if (!archiveTarget) return
    await archiveAttr.mutateAsync(archiveTarget.id)
    setArchiveTarget(null)
  }

  const live = attributes.filter((a) => !a.archivedAt)
  const archived = attributes.filter((a) => !!a.archivedAt)

  const items: AttributeListItem[] = [...live, ...archived].map((attr) => {
    const isArchived = !!attr.archivedAt
    return {
      id: attr.id,
      label: attr.label,
      attrKey: attr.key,
      typeLabel: FIELD_TYPES.find((t) => t.value === attr.fieldType)?.label ?? attr.fieldType,
      description: attr.description,
      muted: isArchived,
      badges: (
        <>
          {attr.sourceHint && attr.sourceHint !== 'ai' && (
            <span className="text-[13px] font-normal text-muted-foreground">
              Usually set by{' '}
              {SOURCE_HINTS.find((h) => h.value === attr.sourceHint)?.usually ?? attr.sourceHint}
            </span>
          )}
          {attr.requiredToClose && (
            <Badge variant="outline" size="sm">
              Required to close
            </Badge>
          )}
          {isArchived && (
            <Badge variant="secondary" size="sm">
              Archived
            </Badge>
          )}
        </>
      ),
      actions: isArchived
        ? [{ label: 'Restore', onSelect: () => restoreAttr.mutate(attr.id) }]
        : [
            { label: 'Edit', onSelect: () => setEditTarget(attr) },
            { label: 'Archive', onSelect: () => setArchiveTarget(attr) },
          ],
    }
  })

  return (
    <AttributeList
      items={items}
      onNew={() => setCreateOpen(true)}
      emptyDescription="Capture structured data on conversations and tickets."
    >
      <AttributeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createAttr.isPending}
      />

      <AttributeFormDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        initialValues={
          editTarget
            ? {
                id: editTarget.id,
                key: editTarget.key,
                label: editTarget.label,
                description: editTarget.description ?? '',
                fieldType: editTarget.fieldType as FieldType,
                options: (editTarget.options ?? []).map((o) => ({
                  id: o.id,
                  label: o.label,
                  description: o.description ?? '',
                })),
                requiredToClose: editTarget.requiredToClose,
                sourceHint: editTarget.sourceHint ?? 'none',
              }
            : undefined
        }
        onSubmit={handleUpdate}
        isPending={updateAttr.isPending}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={`Archive "${archiveTarget?.label}"?`}
        description="Archived attributes disappear from pickers and the inbox editor. Stored values are kept and the key stays reserved. You can restore it at any time."
        confirmLabel="Archive attribute"
        isPending={archiveAttr.isPending}
        onConfirm={handleArchive}
      />
    </AttributeList>
  )
}
