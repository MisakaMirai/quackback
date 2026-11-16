import { useEffect, useMemo, useState } from 'react'
import type { IntlShape } from 'react-intl'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  PERMISSION_CATALOGUE,
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  type PermissionKey,
} from '@/lib/shared/permissions'
import { CATEGORY_LABELS } from '@/lib/client/permission-labels'
import { usePermissions, useHasPermission } from '@/lib/client/hooks/use-root-context'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { settingsQueries } from '@/lib/client/queries/settings'
import { createRoleFn, updateRoleFn, deleteRoleFn, listRolesFn } from '@/lib/server/functions/roles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SearchInput } from '@/components/shared/search-input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/shared/utils'
import { toastError } from '@/lib/client/error-notice'

type RoleWithMeta = Awaited<ReturnType<typeof listRolesFn>>['roles'][number]

type RoleEditorProps =
  { mode: 'edit'; roleId: string } | { mode: 'create'; duplicateFromId?: string }

const ROLES_TAB = { to: '/admin/settings/members', search: { tab: 'roles' } } as const

/**
 * Full-page create / edit / view surface for a role, shared by /roles/new and
 * /roles/:roleId. Custom roles are editable by role.manage holders; system
 * presets and viewers without role.manage see the same page read-only. Create
 * mode adds a Start-from band that stages a source role into the grid.
 */
export function RoleEditor(props: RoleEditorProps) {
  const intl = useOptionalIntl()
  const { data } = useSuspenseQuery(settingsQueries.roles())
  const held = usePermissions()
  const canManage = useHasPermission(PERMISSIONS.ROLE_MANAGE)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const crumbs = [
    {
      label: intl.formatMessage({
        id: 'admin.settings.team.roleEditor.crumbMembers',
        defaultMessage: 'Members & Teams',
      }),
      to: '/admin/settings/members',
    },
    {
      label: intl.formatMessage({
        id: 'admin.settings.members.tabRoles',
        defaultMessage: 'Roles',
      }),
      to: '/admin/settings/members',
      search: { tab: 'roles' },
    },
  ]

  const isCreate = props.mode === 'create'
  const role = props.mode === 'edit' ? data.roles.find((r) => r.id === props.roleId) : undefined
  // Presets are never editable; neither is anything for a viewer without
  // role.manage. Read-only shows the same page with inputs and toggles frozen.
  const readOnly = !isCreate && (!!role?.isSystem || !canManage)

  // Create mode: which role (if any) seeds the grid. An unresolvable ?from
  // falls back to blank so the Select shows a real value.
  const [sourceId, setSourceId] = useState<string>(() => {
    if (!isCreate || !props.duplicateFromId) return 'blank'
    return data.roles.some((r) => r.id === props.duplicateFromId) ? props.duplicateFromId : 'blank'
  })
  const sourceRole =
    isCreate && sourceId !== 'blank' ? data.roles.find((r) => r.id === sourceId) : null

  const [name, setName] = useState(
    isCreate ? (sourceRole ? autoName(sourceRole, intl) : '') : (role?.name ?? '')
  )
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<PermissionKey>>(() =>
    isCreate
      ? stageFrom(sourceRole, held)
      : new Set((role?.permissionKeys ?? []) as PermissionKey[])
  )
  const [search, setSearch] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Collapsed by default; categories carrying newly-shipped keys start open so
  // the New badges are seen. Searching expands every matching category.
  const [openCats, setOpenCats] = useState<Set<string>>(
    () =>
      new Set(
        PERMISSION_CATALOGUE.filter((p) => (role?.newPermissionKeys ?? []).includes(p.key)).map(
          (p) => p.category
        )
      )
  )

  const newKeys = useMemo(
    () => new Set((role?.newPermissionKeys ?? []) as PermissionKey[]),
    [role?.newPermissionKeys]
  )

  const warnDropped = (dropped: number) => {
    toast.info(
      intl.formatMessage(
        {
          id: 'admin.settings.team.roleEditor.droppedPermissions',
          defaultMessage:
            "{count, plural, one {# permission you don't hold was left off.} other {# permissions you don't hold were left off.}}",
        },
        { count: dropped }
      )
    )
  }

  // Duplicating via ?from stages source∩ceiling on mount; surface any keys the
  // ceiling dropped once (the Select's own toast only fires on re-pick).
  useEffect(() => {
    if (!isCreate || !sourceRole) return
    const dropped = sourceRole.permissionKeys.filter((k) => !held.has(k as PermissionKey)).length
    if (dropped > 0) warnDropped(dropped)
    // Mount-only: sourceRole is fixed for the life of this route (key on ?from).
  }, [])

  const onSourceChange = (nextId: string) => {
    setSourceId(nextId)
    const next = nextId === 'blank' ? null : (data.roles.find((r) => r.id === nextId) ?? null)
    setSelected(stageFrom(next, held))
    // Only auto-fill the name while the user hasn't typed their own.
    setName((prev) =>
      prev === '' || prev === autoName(sourceRole, intl) ? autoName(next, intl) : prev
    )
    if (next) {
      const dropped = next.permissionKeys.filter((k) => !held.has(k as PermissionKey)).length
      if (dropped > 0) warnDropped(dropped)
    }
  }

  const submit = useMutation({
    mutationFn: async (): Promise<void> => {
      if (isCreate) {
        await createRoleFn({
          data: {
            name: name.trim(),
            description: description.trim() || null,
            permissionKeys: [...selected],
          },
        })
      } else {
        await updateRoleFn({
          data: {
            roleId: (props as { roleId: string }).roleId,
            name: name.trim(),
            description: description.trim() || null,
            permissionKeys: [...selected],
          },
        })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      toast.success(
        isCreate
          ? intl.formatMessage({
              id: 'admin.settings.team.roleEditor.createdToast',
              defaultMessage: 'Role created',
            })
          : intl.formatMessage({
              id: 'admin.settings.team.roleEditor.savedToast',
              defaultMessage: 'Role saved',
            })
      )
      navigate(ROLES_TAB)
    },
    onError: (error) => {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.roleEditor.saveFailed',
          defaultMessage: "Couldn't save role. Try again.",
        })
      )
    },
  })

  if (props.mode === 'edit' && !role) {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({
          id: 'admin.settings.team.roleEditor.notFound',
          defaultMessage: 'Role not found.',
        })}
      </p>
    )
  }

  const duplicate = () =>
    navigate({ to: '/admin/settings/members/roles/new', search: { from: role?.id } })

  const query = search.trim().toLowerCase()
  const visible = PERMISSION_CATALOGUE.filter((p) => !query || p.key.toLowerCase().includes(query))

  const toggle = (key: PermissionKey) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <SettingsPage
      title={
        isCreate
          ? intl.formatMessage({
              id: 'admin.settings.team.roleEditor.newRole',
              defaultMessage: 'New role',
            })
          : (role?.name ?? '')
      }
      description={readOnly ? role?.description || undefined : undefined}
      crumbs={crumbs}
      actions={
        canManage && !isCreate ? (
          <Button variant="outline" size="sm" onClick={duplicate}>
            {intl.formatMessage({
              id: 'admin.settings.security.idp.table.duplicate',
              defaultMessage: 'Duplicate',
            })}
          </Button>
        ) : undefined
      }
    >
      {!readOnly && (
        <SettingsCard>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="role-editor-name">
                {intl.formatMessage({
                  id: 'admin.people.new.nameLabel',
                  defaultMessage: 'Name',
                })}
              </Label>
              <Input
                id="role-editor-name"
                className="max-w-xs font-medium"
                value={name}
                maxLength={64}
                placeholder={intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.namePlaceholder',
                  defaultMessage: 'Support Lead',
                })}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-editor-description">
                {intl.formatMessage({
                  id: 'admin.roadmap.form.description',
                  defaultMessage: 'Description',
                })}
              </Label>
              <Input
                id="role-editor-description"
                className="w-full max-w-md"
                value={description}
                maxLength={280}
                placeholder={intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.descriptionPlaceholder',
                  defaultMessage: 'What is this role for?',
                })}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </SettingsCard>
      )}

      {isCreate && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-2.5">
          <Label className="text-[13px] text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.team.roleEditor.startFrom',
              defaultMessage: 'Start from',
            })}
          </Label>
          <Select value={sourceId} onValueChange={onSourceChange}>
            <SelectTrigger size="sm" className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">
                {intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.blankOption',
                  defaultMessage: 'Blank, no permissions',
                })}
              </SelectItem>
              {data.roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {intl.formatMessage(
                    {
                      id: 'admin.settings.team.roleEditor.duplicateOption',
                      defaultMessage:
                        'Duplicate {name} · {count, plural, one {# permission} other {# permissions}}',
                    },
                    { name: r.name, count: r.permissionKeys.length }
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.team.roleEditor.stageHint',
              defaultMessage: 'Picking a role stages its permissions below. Edit from there.',
            })}
          </span>
        </div>
      )}

      <div className="max-w-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={intl.formatMessage(
            {
              id: 'admin.settings.team.roleEditor.filterPlaceholder',
              defaultMessage: 'Filter {count} permissions…',
            },
            { count: PERMISSION_CATALOGUE.length }
          )}
        />
      </div>

      <SettingsCard flush contentClassName="divide-y divide-border/50">
        {PERMISSION_CATEGORIES.map((category) => {
          const inCategory = visible.filter((p) => p.category === category)
          if (inCategory.length === 0) return null
          const grantedCount = inCategory.filter((p) => selected.has(p.key)).length
          const togglable = inCategory.filter((p) => held.has(p.key) || selected.has(p.key))
          const allOn = togglable.length > 0 && togglable.every((p) => selected.has(p.key))
          const isOpen = query ? true : openCats.has(category)
          return (
            <div key={category}>
              <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                <Checkbox
                  checked={grantedCount === 0 ? false : allOn ? true : 'indeterminate'}
                  disabled={readOnly || togglable.length === 0}
                  aria-label={intl.formatMessage(
                    {
                      id: 'admin.settings.team.roleEditor.toggleCategory',
                      defaultMessage: 'Toggle all {category} permissions',
                    },
                    { category: CATEGORY_LABELS[category] }
                  )}
                  onCheckedChange={(checked) => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      for (const p of inCategory) {
                        if (checked === true) {
                          if (held.has(p.key)) next.add(p.key)
                        } else {
                          next.delete(p.key)
                        }
                      }
                      return next
                    })
                  }}
                />
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenCats((prev) => {
                      const next = new Set(prev)
                      if (next.has(category)) next.delete(category)
                      else next.add(category)
                      return next
                    })
                  }
                >
                  <span className="text-sm font-medium">{CATEGORY_LABELS[category]}</span>
                  {inCategory.some((p) => newKeys.has(p.key)) && (
                    <Badge size="sm" variant="outline">
                      {intl.formatMessage({ id: 'common.new', defaultMessage: 'New' })}
                    </Badge>
                  )}
                  <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
                    {intl.formatMessage(
                      {
                        id: 'admin.settings.team.roleEditor.grantedCount',
                        defaultMessage: '{granted} of {total}',
                      },
                      { granted: grantedCount, total: inCategory.length }
                    )}
                  </span>
                </button>
              </div>
              {isOpen && (
                <ul className="border-t border-border/50 bg-muted/20 pb-1">
                  {inCategory.map((p) => {
                    // Above the editor's ceiling: can't be granted here. Still
                    // removable when already on the role (de-escalation is free).
                    const aboveCeiling = !readOnly && !held.has(p.key) && !selected.has(p.key)
                    return (
                      <li
                        key={p.key}
                        className={cn(
                          'flex items-center gap-3 py-1.5 pl-10 pr-4 text-[13px] sm:pl-12 sm:pr-6',
                          aboveCeiling && 'opacity-50'
                        )}
                      >
                        <Checkbox
                          checked={selected.has(p.key)}
                          disabled={readOnly || aboveCeiling}
                          aria-label={p.key}
                          onCheckedChange={() => toggle(p.key)}
                        />
                        <span className="font-mono text-xs">{p.key}</span>
                        {newKeys.has(p.key) && (
                          <Badge size="sm" variant="outline">
                            {intl.formatMessage({ id: 'common.new', defaultMessage: 'New' })}
                          </Badge>
                        )}
                        {aboveCeiling && (
                          <span className="ml-auto hidden text-right text-xs text-muted-foreground sm:block">
                            {intl.formatMessage({
                              id: 'admin.settings.team.roleEditor.aboveCeiling',
                              defaultMessage: "You don't hold this",
                            })}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </SettingsCard>

      {!readOnly && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 shadow-sm">
          <span className="text-xs text-muted-foreground">
            {isCreate
              ? intl.formatMessage(
                  {
                    id: 'admin.settings.team.roleEditor.selectedCount',
                    defaultMessage: '{selected} of {total} selected',
                  },
                  { selected: selected.size, total: PERMISSION_CATALOGUE.length }
                )
              : intl.formatMessage(
                  {
                    id: 'admin.settings.team.roleEditor.grantedSummary',
                    defaultMessage: '{selected} of {total} granted',
                  },
                  { selected: selected.size, total: PERMISSION_CATALOGUE.length }
                )}
            {isCreate && sourceRole && (
              <>
                {' · '}
                {intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.stagedFrom',
                  defaultMessage: 'staged from',
                })}{' '}
                <span className="font-medium text-foreground">{sourceRole.name}</span>
              </>
            )}
            {!isCreate && newKeys.size > 0 && (
              <>
                {' · '}
                <span className="font-medium text-foreground">
                  {intl.formatMessage(
                    {
                      id: 'admin.settings.team.roleEditor.addedSinceEdit',
                      defaultMessage:
                        '{count, plural, one {# permission added since last edit} other {# permissions added since last edit}}',
                    },
                    { count: newKeys.size }
                  )}
                </span>
              </>
            )}
          </span>
          <div className="flex gap-2">
            {!isCreate && (
              <Button
                variant="outline-destructive"
                size="sm"
                className="mr-auto"
                onClick={() => setDeleteOpen(true)}
              >
                {intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.deleteRole',
                  defaultMessage: 'Delete role',
                })}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(ROLES_TAB)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              onClick={() => submit.mutate()}
              disabled={!name.trim() || submit.isPending}
            >
              {submit.isPending
                ? isCreate
                  ? intl.formatMessage({
                      id: 'admin.settings.team.roleEditor.creating',
                      defaultMessage: 'Creating…',
                    })
                  : intl.formatMessage({
                      id: 'admin.settings.team.roleEditor.saving',
                      defaultMessage: 'Saving…',
                    })
                : isCreate
                  ? intl.formatMessage({
                      id: 'admin.settings.team.roleEditor.createRole',
                      defaultMessage: 'Create role',
                    })
                  : intl.formatMessage({
                      id: 'admin.settings.team.roleEditor.saveRole',
                      defaultMessage: 'Save role',
                    })}
            </Button>
          </div>
        </div>
      )}

      {role && !isCreate && (
        <DeleteRoleDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          role={role}
          roles={data.roles}
        />
      )}
    </SettingsPage>
  )
}

function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  roles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleWithMeta
  roles: RoleWithMeta[]
}) {
  const intl = useOptionalIntl()
  const [reassignTo, setReassignTo] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const needsReassign = role.memberCount > 0
  const targets = roles.filter((r) => r.id !== role.id && r.key !== 'owner')

  const remove = useMutation({
    mutationFn: () =>
      deleteRoleFn({
        data: { roleId: role.id, reassignToRoleId: needsReassign ? reassignTo : undefined },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
      toast.success(
        intl.formatMessage({
          id: 'admin.settings.team.roleEditor.deletedToast',
          defaultMessage: 'Role deleted',
        })
      )
      navigate(ROLES_TAB)
    },
    onError: (error) => {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.roleEditor.deleteFailed',
          defaultMessage: "Couldn't delete role. Try again.",
        })
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.settings.team.roleEditor.deleteTitle',
              defaultMessage: 'Delete role?',
            })}
          </DialogTitle>
          <DialogDescription>
            {needsReassign
              ? intl.formatMessage(
                  {
                    id: 'admin.settings.team.roleEditor.deleteDescriptionMembers',
                    defaultMessage:
                      '{count, plural, one {# member hold this role. Choose the role they should move to. They keep workspace access either way.} other {# members hold this role. Choose the role they should move to. They keep workspace access either way.}}',
                  },
                  { count: role.memberCount }
                )
              : intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.deleteDescriptionNobody',
                  defaultMessage: 'Nobody holds this role. This removes it permanently.',
                })}
          </DialogDescription>
        </DialogHeader>
        {needsReassign && (
          <div className="space-y-2">
            <Label>
              {intl.formatMessage({
                id: 'admin.settings.team.roleEditor.reassignTo',
                defaultMessage: 'Reassign members to',
              })}
            </Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger>
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.settings.team.roleEditor.chooseRole',
                    defaultMessage: 'Choose a role',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {targets.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || (needsReassign && !reassignTo)}
          >
            {remove.isPending
              ? intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.deleting',
                  defaultMessage: 'Deleting…',
                })
              : intl.formatMessage({
                  id: 'admin.settings.team.roleEditor.deleteRole',
                  defaultMessage: 'Delete role',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A role's permissions intersected with the editor's ceiling. */
function stageFrom(
  source: RoleWithMeta | null | undefined,
  held: ReadonlySet<PermissionKey>
): Set<PermissionKey> {
  if (!source) return new Set()
  return new Set((source.permissionKeys as PermissionKey[]).filter((k) => held.has(k)))
}

function autoName(source: RoleWithMeta | null | undefined, intl: IntlShape): string {
  if (!source) return ''
  return intl
    .formatMessage(
      { id: 'admin.settings.team.roleEditor.copyName', defaultMessage: '{name} copy' },
      { name: source.name }
    )
    .slice(0, 64)
}
