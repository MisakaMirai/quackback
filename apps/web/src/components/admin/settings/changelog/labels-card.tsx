import { useId, useState, useEffect, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bars3Icon, TagIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { RowDot, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { AUTOSAVE } from '@/lib/client/autosave'
import { SegmentMultiSelect } from '@/components/admin/segments/segment-multi-select'
import { cn } from '@/lib/shared/utils'
import { changelogCategoryQueries } from '@/lib/client/queries/changelog'
import {
  createChangelogCategoryFn,
  updateChangelogCategoryFn,
  deleteChangelogCategoryFn,
  reorderChangelogCategoriesFn,
} from '@/lib/server/functions/changelog-categories'
import type { ChangelogCategory } from '@/lib/server/domains/changelog/changelog-category.types'
import { errorText } from '@/lib/client/error-text'
import { toastError } from '@/lib/client/error-notice'

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#0f172a',
]

function randomColor(): string {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

function ColorPickerGrid({
  selectedColor,
  onColorChange,
}: {
  selectedColor: string
  onColorChange: (color: string) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn(
            'h-6 w-6 rounded-full border-2 transition-colors',
            selectedColor.toLowerCase() === c.toLowerCase()
              ? 'border-foreground'
              : 'border-transparent'
          )}
          style={{ backgroundColor: c }}
          onClick={() => onColorChange(c)}
        />
      ))}
    </div>
  )
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: ChangelogCategory | null
  segments: { id: string; name: string }[]
  onSaved: (saved: ChangelogCategory) => void
}

function CategoryDialog({ open, onOpenChange, category, segments, onSaved }: CategoryDialogProps) {
  const intl = useOptionalIntl()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isEdit = category !== null

  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name)
        setColor(category.color)
        setSegmentIds(category.segmentIds)
      } else {
        setName('')
        setColor(randomColor())
        setSegmentIds([])
      }
      setError(null)
    }
  }, [open, category])

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(
        intl.formatMessage({
          id: 'admin.settings.changelog.labels.nameRequired',
          defaultMessage: 'Name is required',
        })
      )
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      let saved: ChangelogCategory
      if (isEdit) {
        saved = await updateChangelogCategoryFn({
          data: { id: category.id, name: trimmedName, color, segmentIds },
        })
      } else {
        saved = await createChangelogCategoryFn({
          data: { name: trimmedName, color, segmentIds },
        })
      }
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.settings.changelog.labels.saveFailed',
            defaultMessage: 'Failed to save label',
          })
        )
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage(
              isEdit
                ? {
                    id: 'admin.settings.changelog.labels.editTitle',
                    defaultMessage: 'Edit label',
                  }
                : {
                    id: 'admin.settings.changelog.labels.createTitle',
                    defaultMessage: 'Create label',
                  }
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center py-3 bg-muted/30 rounded-lg">
          <span
            className="inline-flex items-center px-3 py-0.5 rounded-md text-sm font-medium"
            style={{ backgroundColor: color + '20', color }}
          >
            {name.trim() ||
              intl.formatMessage({
                id: 'admin.settings.changelog.labels.namePreview',
                defaultMessage: 'Label name',
              })}
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category-name">
            {intl.formatMessage({
              id: 'admin.settings.changelog.labels.nameLabel',
              defaultMessage: 'Name',
            })}
          </Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={intl.formatMessage({
              id: 'admin.settings.changelog.labels.namePlaceholder',
              defaultMessage: 'e.g. New, Improved, Fixed',
            })}
            maxLength={50}
          />
        </div>

        <div className="space-y-2">
          <Label>
            {intl.formatMessage({
              id: 'admin.settings.changelog.labels.colorLabel',
              defaultMessage: 'Color',
            })}
          </Label>
          <ColorPickerGrid selectedColor={color} onColorChange={setColor} />
        </div>

        {segments.length > 0 && (
          <div className="space-y-2">
            <Label>
              {intl.formatMessage({
                id: 'admin.settings.changelog.labels.restrictToSegments',
                defaultMessage: 'Restrict to segments',
              })}{' '}
              <span className="text-muted-foreground font-normal">
                {intl.formatMessage({
                  id: 'admin.settings.changelog.labels.optional',
                  defaultMessage: '(optional)',
                })}
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.changelog.labels.restrictHint',
                defaultMessage: 'Leave empty to show this category to everyone.',
              })}
            </p>
            <SegmentMultiSelect
              segments={segments}
              value={segmentIds}
              onChange={setSegmentIds}
              ariaLabel={intl.formatMessage({
                id: 'admin.settings.changelog.labels.segmentGate',
                defaultMessage: 'Category segment gate',
              })}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {intl.formatMessage(
              isSaving
                ? {
                    id: 'admin.settings.changelog.labels.saving',
                    defaultMessage: 'Saving...',
                  }
                : isEdit
                  ? {
                      id: 'admin.settings.changelog.labels.saveChanges',
                      defaultMessage: 'Save changes',
                    }
                  : {
                      id: 'admin.settings.changelog.labels.createSubmit',
                      defaultMessage: 'Create label',
                    }
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SortableLabelRow({
  category,
  segments,
  onEdit,
  onDelete,
}: {
  category: ChangelogCategory
  segments: { id: string; name: string }[]
  onEdit: () => void
  onDelete: () => void
}) {
  const intl = useOptionalIntl()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })
  const gated = category.segmentIds.length > 0

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <SettingsListRow
        grip={
          <button
            {...attributes}
            {...listeners}
            aria-label={intl.formatMessage(
              {
                id: 'admin.settings.changelog.labels.reorderAria',
                defaultMessage: 'Reorder {name}',
              },
              { name: category.name }
            )}
            className="touch-none cursor-grab active:cursor-grabbing"
          >
            <Bars3Icon className="size-4 text-muted-foreground/70" />
          </button>
        }
        leading={<RowDot color={category.color} />}
        title={category.name}
        badges={
          gated && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/70">
                  {intl.formatMessage(
                    {
                      id: 'admin.settings.changelog.labels.segmentCount',
                      defaultMessage: '{count, plural, one {# segment} other {# segments}}',
                    },
                    { count: category.segmentIds.length }
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-xs" align="start">
                {intl.formatMessage(
                  {
                    id: 'admin.settings.changelog.labels.visibleTo',
                    defaultMessage: 'Only visible to members of {segments}.',
                  },
                  {
                    segments: category.segmentIds
                      .map((id) => segments.find((s) => s.id === id)?.name ?? id)
                      .join(', '),
                  }
                )}
              </PopoverContent>
            </Popover>
          )
        }
        actions={[
          {
            label: intl.formatMessage({
              id: 'admin.settings.changelog.labels.edit',
              defaultMessage: 'Edit',
            }),
            onSelect: onEdit,
          },
          {
            label: intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' }),
            onSelect: onDelete,
            destructive: true,
          },
        ]}
      />
    </div>
  )
}

interface LabelsCardProps {
  initialCategories: ChangelogCategory[]
}

export function LabelsCard({ initialCategories }: LabelsCardProps) {
  const intl = useOptionalIntl()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [categories, setCategories] = useState(initialCategories)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ChangelogCategory | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<ChangelogCategory | null>(null)

  const segmentsQuery = useQuery(changelogCategoryQueries.segments())
  const segments = (segmentsQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))

  function handleCategorySaved(saved: ChangelogCategory) {
    if (editingCategory) {
      setCategories((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
    } else {
      setCategories((prev) => [...prev, saved])
    }
    startTransition(() => router.invalidate())
  }

  function openCreate() {
    setEditingCategory(null)
    setDialogOpen(true)
  }

  function openEdit(category: ChangelogCategory) {
    setEditingCategory(category)
    setDialogOpen(true)
  }

  async function handleDelete() {
    if (!deletingCategory) return
    try {
      await deleteChangelogCategoryFn({ data: { id: deletingCategory.id } })
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id))
      startTransition(() => router.invalidate())
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.changelog.labels.deleteFailed',
          defaultMessage: 'Failed to delete label',
        })
      )
    } finally {
      setDeletingCategory(null)
    }
  }

  // A reorder saves on drop. A failure restores the previous order; the
  // autosave handler shows the one toast.
  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderChangelogCategoriesFn({ data: { ids } }),
    meta: AUTOSAVE,
    onSuccess: () => startTransition(() => router.invalidate()),
    onError: (_error, _ids, previous) => setCategories(previous ?? initialCategories),
    onMutate: () => categories,
  })

  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(categories, oldIndex, newIndex)
    setCategories(next)
    reorderMutation.mutate(next.map((c) => c.id))
  }

  return (
    <>
      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.changelog.labels.cardTitle',
          defaultMessage: 'Labels',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.changelog.labels.cardDescription',
          defaultMessage: 'Group entries by label.',
        })}
        action={<NewButton noun="label" onClick={openCreate} />}
        flush
      >
        {categories.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title={intl.formatMessage({
              id: 'admin.settings.changelog.labels.emptyTitle',
              defaultMessage: 'No labels yet',
            })}
            size="compact"
          />
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SettingsList>
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((category) => (
                  <SortableLabelRow
                    key={category.id}
                    category={category}
                    segments={segments}
                    onEdit={() => openEdit(category)}
                    onDelete={() => setDeletingCategory(category)}
                  />
                ))}
              </SortableContext>
            </SettingsList>
          </DndContext>
        )}
      </SettingsCard>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        segments={segments}
        onSaved={handleCategorySaved}
      />

      <ConfirmDialog
        open={!!deletingCategory}
        onOpenChange={() => setDeletingCategory(null)}
        title={intl.formatMessage({
          id: 'admin.settings.changelog.labels.deleteTitle',
          defaultMessage: 'Delete label?',
        })}
        description={intl.formatMessage(
          {
            id: 'admin.settings.changelog.labels.deleteDescription',
            defaultMessage: 'Delete "{name}"? This removes it from every changelog entry.',
          },
          { name: deletingCategory?.name ?? '' }
        )}
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.changelog.labels.deleteConfirm',
          defaultMessage: 'Delete label',
        })}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  )
}
