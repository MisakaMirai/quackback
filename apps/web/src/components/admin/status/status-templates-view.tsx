import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/solid'
import { DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { AdminListHeader } from '@/components/admin/admin-list-header'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  statusComponentQueries,
  statusTemplateQueries,
  type StatusComponentsAdmin,
  type StatusIncidentTemplate,
} from '@/lib/client/queries/status'
import {
  useCreateStatusIncidentTemplate,
  useDeleteStatusIncidentTemplate,
  useUpdateStatusIncidentTemplate,
} from '@/lib/client/mutations/status'
import { IMPACT_LABEL } from '@/components/portal/status/status-colors'
import { type StatusIncidentImpact } from './status-admin-colors'
import { useStatusAccess } from './status-access'
import { toastError } from '@/lib/client/error-notice'

function flattenComponents(data: StatusComponentsAdmin | undefined) {
  if (!data) return []
  const flat: Array<{ id: string; name: string }> = []
  for (const group of data.groups)
    for (const c of group.components) flat.push({ id: c.id, name: c.name })
  for (const c of data.ungrouped) flat.push({ id: c.id, name: c.name })
  return flat
}

export function StatusTemplatesView() {
  const intl = useOptionalIntl()
  const { data: templates, isLoading } = useQuery(statusTemplateQueries.list())
  // Publishers read templates (the composers insert them); only
  // status_page.manage adds, edits or deletes them.
  const { canManage } = useStatusAccess()
  const [editing, setEditing] = useState<StatusIncidentTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StatusIncidentTemplate | null>(null)
  const deleteMutation = useDeleteStatusIncidentTemplate()
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const visibleTemplates = (templates ?? []).filter(
    (t) => !term || t.name.toLowerCase().includes(term) || t.title.toLowerCase().includes(term)
  )

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.templates.toastDeleteFailed',
          defaultMessage: 'Failed to delete template',
        })
      )
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="max-w-3xl w-full flex flex-col flex-1 min-h-0">
      <AdminListHeader
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={intl.formatMessage({
          id: 'admin.status.templates.searchPlaceholder',
          defaultMessage: 'Search templates...',
        })}
        action={
          canManage ? <NewButton noun="template" onClick={() => setCreating(true)} /> : undefined
        }
      />

      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="p-3">
          <EmptyState
            icon={DocumentDuplicateIcon}
            title={intl.formatMessage({
              id: 'admin.status.templates.emptyTitle',
              defaultMessage: 'No templates yet',
            })}
            description={intl.formatMessage({
              id: 'admin.status.templates.emptyDescription',
              defaultMessage:
                "Templates prefill an incident's title, body, impact, and affected components.",
            })}
            action={
              canManage ? (
                <NewButton noun="template" onClick={() => setCreating(true)} />
              ) : undefined
            }
            className="h-48"
          />
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="overflow-hidden border-y border-t-transparent border-border/50 divide-y divide-border/50">
            {visibleTemplates.map((t) => (
              <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.title}</div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {intl.formatMessage({
                    id: IMPACT_LABEL[t.impact].id,
                    defaultMessage: IMPACT_LABEL[t.impact].defaultMessage,
                  })}
                </span>
                {t.usageCount > 0 ? (
                  <Badge variant="outline" size="sm">
                    {t.usageCount === 1
                      ? intl.formatMessage({
                          id: 'admin.status.templates.usedOnce',
                          defaultMessage: 'Used once',
                        })
                      : intl.formatMessage(
                          {
                            id: 'admin.status.templates.usedTimes',
                            defaultMessage: 'Used {count} times',
                          },
                          { count: t.usageCount }
                        )}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {intl.formatMessage({
                      id: 'admin.status.templates.unused',
                      defaultMessage: 'Unused',
                    })}
                  </span>
                )}
                {canManage && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditing(t)}
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(t)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground px-1">
            {intl.formatMessage({
              id: 'admin.status.templates.footerHint',
              defaultMessage:
                'Templates pre-fill the incident report and can be inserted into any update from the composer.',
            })}
          </p>
        </div>
      )}

      {/* The form reads the full service list, which is manage-only too. */}
      {canManage && (
        <>
          <TemplateFormDialog open={creating} onOpenChange={setCreating} mode="create" />
          <TemplateFormDialog
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            mode="edit"
            template={editing}
          />

          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={intl.formatMessage({
              id: 'admin.status.templates.deleteTitle',
              defaultMessage: 'Delete template?',
            })}
            description={intl.formatMessage(
              {
                id: 'admin.status.confirm.deleteDescription',
                defaultMessage: 'Are you sure you want to delete "{name}"? This cannot be undone.',
              },
              { name: deleteTarget?.name }
            )}
            confirmLabel={intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' })}
            variant="destructive"
            isPending={deleteMutation.isPending}
            onConfirm={confirmDelete}
          />
        </>
      )}
    </div>
  )
}

interface TemplateFormValues {
  name: string
  title: string
  body: string
  impact: StatusIncidentImpact
  componentIds: string[]
}

const EMPTY_TEMPLATE: TemplateFormValues = {
  name: '',
  title: '',
  body: '',
  impact: 'minor',
  componentIds: [],
}

function TemplateFormDialog({
  open,
  onOpenChange,
  mode,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  template?: StatusIncidentTemplate | null
}) {
  const [values, setValues] = useState<TemplateFormValues>(EMPTY_TEMPLATE)
  const intl = useOptionalIntl()
  const { data: componentsData } = useQuery(statusComponentQueries.list())
  const components = useMemo(() => flattenComponents(componentsData), [componentsData])
  const createMutation = useCreateStatusIncidentTemplate()
  const updateMutation = useUpdateStatusIncidentTemplate()
  const isPending = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && template) {
      setValues({
        name: template.name,
        title: template.title,
        body: template.body,
        impact: template.impact,
        componentIds: template.componentIds,
      })
    } else {
      setValues(EMPTY_TEMPLATE)
    }
  }, [open, mode, template])

  function toggleComponent(id: string) {
    setValues((v) => ({
      ...v,
      componentIds: v.componentIds.includes(id)
        ? v.componentIds.filter((c) => c !== id)
        : [...v.componentIds, id],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim() || !values.title.trim() || !values.body.trim()) return
    try {
      if (mode === 'edit' && template) {
        await updateMutation.mutateAsync({
          id: template.id,
          name: values.name.trim(),
          title: values.title.trim(),
          body: values.body.trim(),
          impact: values.impact,
          componentIds: values.componentIds,
        })
      } else {
        await createMutation.mutateAsync({
          name: values.name.trim(),
          title: values.title.trim(),
          body: values.body.trim(),
          impact: values.impact,
          componentIds: values.componentIds,
        })
      }
      onOpenChange(false)
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.templates.toastSaveFailed',
          defaultMessage: 'Failed to save template',
        })
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? intl.formatMessage({
                  id: 'admin.status.templates.editTitle',
                  defaultMessage: 'Edit template',
                })
              : intl.formatMessage({
                  id: 'admin.status.templates.newTitle',
                  defaultMessage: 'New template',
                })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">
              {intl.formatMessage({
                id: 'admin.status.templates.nameLabel',
                defaultMessage: 'Template name',
              })}
            </Label>
            <Input
              id="template-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder={intl.formatMessage({
                id: 'admin.status.templates.namePlaceholder',
                defaultMessage: 'e.g., API degradation',
              })}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-title">
              {intl.formatMessage({
                id: 'admin.status.templates.titleLabel',
                defaultMessage: 'Incident title',
              })}
            </Label>
            <Input
              id="template-title"
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-body">
              {intl.formatMessage({ id: 'admin.status.field.body', defaultMessage: 'Body' })}
            </Label>
            <Textarea
              id="template-body"
              value={values.body}
              onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
              className="min-h-24"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>
              {intl.formatMessage({ id: 'admin.status.field.impact', defaultMessage: 'Impact' })}
            </Label>
            <Select
              value={values.impact}
              onValueChange={(v) =>
                setValues((val) => ({ ...val, impact: v as StatusIncidentImpact }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">
                  {intl.formatMessage({
                    id: IMPACT_LABEL.minor.id,
                    defaultMessage: IMPACT_LABEL.minor.defaultMessage,
                  })}
                </SelectItem>
                <SelectItem value="major">
                  {intl.formatMessage({
                    id: IMPACT_LABEL.major.id,
                    defaultMessage: IMPACT_LABEL.major.defaultMessage,
                  })}
                </SelectItem>
                <SelectItem value="critical">
                  {intl.formatMessage({
                    id: IMPACT_LABEL.critical.id,
                    defaultMessage: IMPACT_LABEL.critical.defaultMessage,
                  })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              {intl.formatMessage({
                id: 'admin.status.templates.defaultComponents',
                defaultMessage: 'Default affected components',
              })}
            </Label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50">
              {components.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
                >
                  <Checkbox
                    checked={values.componentIds.includes(c.id)}
                    onCheckedChange={() => toggleComponent(c.id)}
                    data-in-label
                  />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button
              type="submit"
              disabled={
                !values.name.trim() || !values.title.trim() || !values.body.trim() || isPending
              }
            >
              {isPending
                ? intl.formatMessage({
                    id: 'admin.status.action.saving',
                    defaultMessage: 'Saving…',
                  })
                : mode === 'edit'
                  ? intl.formatMessage({
                      id: 'admin.status.action.saveChanges',
                      defaultMessage: 'Save changes',
                    })
                  : intl.formatMessage({
                      id: 'admin.status.templates.create',
                      defaultMessage: 'Create template',
                    })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
