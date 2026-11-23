import { useMemo, useState } from 'react'
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { assertRoutePermission } from '@/lib/shared/route-permission'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { isProductEnabled } from '@/lib/shared/types/settings'
import { slaTargetsSummary } from '@/lib/shared/conversation/sla'
import { settingsQueries } from '@/lib/client/queries/settings'
import { useUpdateDefaultSlaPolicy } from '@/lib/client/mutations/settings'
import {
  archiveSlaPolicyFn,
  createSlaPolicyFn,
  getSlaOfficeHoursFn,
  listSlaPoliciesFn,
  restoreSlaPolicyFn,
  updateSlaPolicyFn,
  type SlaPolicyDTO,
} from '@/lib/server/functions/sla'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { SlaRulesPopover } from '@/components/admin/settings/sla-rules-popover'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { warmQuery } from '@/lib/client/queries/warm-query'
import { INLINE_LINK } from '@/components/admin/settings/inline-link'
import { adminPageHead } from '@/lib/client/admin-head'
import { errorText } from '@/lib/client/error-text'

const slaPoliciesQuery = queryOptions({
  queryKey: ['settings', 'slaPolicies'],
  queryFn: () => listSlaPoliciesFn(),
  staleTime: 30_000,
})

const slaOfficeHoursQuery = queryOptions({
  queryKey: ['settings', 'slaOfficeHours'],
  queryFn: () => getSlaOfficeHoursFn(),
  staleTime: 5 * 60 * 1000,
})

export const Route = createFileRoute('/admin/settings/sla')({
  head: adminPageHead('SLA settings', 'admin.pageTitle.slaSettings'),
  beforeLoad: ({ context }) => {
    if (!isProductEnabled(context.settings?.featureFlags, 'support')) {
      throw redirect({ to: '/admin/settings/general' })
    }
  },
  loader: async ({ context }) => {
    assertRoutePermission(context.permissions, PERMISSIONS.SLA_MANAGE)
    await Promise.all([
      context.queryClient.ensureQueryData(slaPoliciesQuery),
      context.queryClient.ensureQueryData(settingsQueries.defaultSlaPolicy()),
      // The policies' office-hours note reads these on first paint.
      warmQuery(context.queryClient, slaOfficeHoursQuery),
    ])
    return {}
  },
  component: SlaSettingsPage,
})

// ── Duration targets: integer + unit, stored as seconds ─────────────────────

type DurationUnit = 'm' | 'h' | 'd'
const UNIT_SECS: Record<DurationUnit, number> = { m: 60, h: 3600, d: 86400 }
const UNIT_LABELS: Record<DurationUnit, MessageDescriptor> = {
  m: { id: 'admin.settings.sla.unitMinutes', defaultMessage: 'minutes' },
  h: { id: 'admin.settings.sla.unitHours', defaultMessage: 'hours' },
  d: { id: 'admin.settings.sla.unitDays', defaultMessage: 'days' },
}

interface DurationDraft {
  value: string
  unit: DurationUnit
}

/** Seconds → the largest exact unit, for editing ("14400" → 4 h). */
function toDraft(secs: number | null): DurationDraft {
  if (!secs) return { value: '', unit: 'h' }
  if (secs % 86400 === 0) return { value: String(secs / 86400), unit: 'd' }
  if (secs % 3600 === 0) return { value: String(secs / 3600), unit: 'h' }
  return { value: String(Math.max(1, Math.round(secs / 60))), unit: 'm' }
}

/** Draft → seconds; null = unset, undefined = invalid input. */
function toSecs(draft: DurationDraft): number | null | undefined {
  const raw = draft.value.trim()
  if (raw === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return undefined
  return n * UNIT_SECS[draft.unit]
}

const TARGET_FIELDS = [
  {
    key: 'firstResponseTargetSecs',
    message: { id: 'admin.settings.sla.firstResponse', defaultMessage: 'First response' },
  },
  {
    key: 'nextResponseTargetSecs',
    message: { id: 'admin.settings.sla.nextResponse', defaultMessage: 'Next response' },
  },
  {
    key: 'timeToCloseTargetSecs',
    message: { id: 'admin.settings.sla.timeToClose', defaultMessage: 'Time to close' },
  },
  {
    key: 'timeToResolveTargetSecs',
    message: { id: 'admin.settings.sla.timeToResolve', defaultMessage: 'Time to resolve' },
  },
] as const
type TargetKey = (typeof TARGET_FIELDS)[number]['key']

// ── Page ─────────────────────────────────────────────────────────────────────

/** Which policy the editor dialog holds: a fresh one, a clone seed, or an edit. */
type EditorState =
  { mode: 'create'; seed: SlaPolicyDTO | null } | { mode: 'edit'; policy: SlaPolicyDTO } | null

const DEFAULT_SLA_NONE = '__none__'

/** A tab label with its row count, e.g. "Live (3)". */
function tabLabel(label: string, count: number): string {
  return count ? `${label} (${count})` : label
}

function SlaSettingsPage() {
  const intl = useIntl()
  const queryClient = useQueryClient()
  const { data: policies } = useSuspenseQuery(slaPoliciesQuery)
  const { data: officeHours } = useQuery(slaOfficeHoursQuery)
  const { data: defaultSla } = useQuery(settingsQueries.defaultSlaPolicy())
  const updateDefaultSla = useUpdateDefaultSlaPolicy()
  const officeHoursEnabled = officeHours?.officeHoursEnabled ?? false
  const [tab, setTab] = useState<'live' | 'archived'>('live')
  const [editor, setEditor] = useState<EditorState>(null)

  const live = useMemo(() => policies.filter((p) => !p.archivedAt), [policies])
  const archived = useMemo(() => policies.filter((p) => p.archivedAt), [policies])
  const rows = tab === 'live' ? live : archived

  const refresh = () => void queryClient.invalidateQueries({ queryKey: slaPoliciesQuery.queryKey })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveSlaPolicyFn({ data: { id } }),
    onSuccess: () => {
      toast.success(
        intl.formatMessage({
          id: 'admin.settings.sla.policyArchived',
          defaultMessage: 'Policy archived',
        })
      )
      refresh()
    },
    onError: () =>
      toast.error(
        intl.formatMessage({
          id: 'admin.settings.sla.archiveFailed',
          defaultMessage: 'Failed to archive policy',
        })
      ),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreSlaPolicyFn({ data: { id } }),
    onSuccess: () => {
      toast.success(
        intl.formatMessage({
          id: 'admin.settings.sla.policyRestored',
          defaultMessage: 'Policy restored',
        })
      )
      refresh()
    },
    onError: () =>
      toast.error(
        intl.formatMessage({
          id: 'admin.settings.sla.restoreFailed',
          defaultMessage: 'Failed to restore policy',
        })
      ),
  })

  return (
    <SettingsPage
      page="/admin/settings/sla"
      description={intl.formatMessage({
        id: 'admin.settings.sla.description',
        defaultMessage: 'Response and resolution targets.',
      })}
    >
      <SettingsCard>
        <SettingRows>
          <SettingRow
            label={intl.formatMessage({
              id: 'settings.sla.defaultPolicy',
              defaultMessage: 'Default policy',
            })}
            description={intl.formatMessage({
              id: 'settings.sla.defaultPolicyHint',
              defaultMessage: 'Applied when a conversation starts',
            })}
            control={
              <>
                <SlaRulesPopover />
                <Select
                  value={defaultSla?.policyId ?? DEFAULT_SLA_NONE}
                  onValueChange={(value) =>
                    updateDefaultSla.mutate({ policyId: value === DEFAULT_SLA_NONE ? null : value })
                  }
                  disabled={updateDefaultSla.isPending}
                >
                  <SelectTrigger size="sm" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_SLA_NONE}>
                      {intl.formatMessage({
                        id: 'settings.sla.defaultPolicyNone',
                        defaultMessage: 'None',
                      })}
                    </SelectItem>
                    {live.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        </SettingRows>
      </SettingsCard>

      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.sla.policiesTitle',
          defaultMessage: 'Policies',
        })}
        action={
          <NewButton noun="policy" onClick={() => setEditor({ mode: 'create', seed: null })}>
            {intl.formatMessage({
              id: 'admin.settings.sla.newPolicy',
              defaultMessage: 'New policy',
            })}
          </NewButton>
        }
        flush
      >
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as 'live' | 'archived')}
          variant="line"
          className="gap-0 px-4 sm:px-6"
        >
          <TabsList className="h-9">
            <TabsTrigger value="live" className="pb-2">
              {tabLabel(
                intl.formatMessage({
                  id: 'admin.settings.sla.tabLive',
                  defaultMessage: 'Live',
                }),
                live.length
              )}
            </TabsTrigger>
            <TabsTrigger value="archived" className="pb-2">
              {tabLabel(
                intl.formatMessage({
                  id: 'admin.settings.sla.tabArchived',
                  defaultMessage: 'Archived',
                }),
                archived.length
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {rows.length === 0 ? (
          <EmptyState
            size="compact"
            icon={ShieldCheckIcon}
            title={
              tab === 'live'
                ? intl.formatMessage({
                    id: 'admin.settings.sla.emptyLiveTitle',
                    defaultMessage: 'No SLA policies yet',
                  })
                : intl.formatMessage({
                    id: 'admin.settings.sla.emptyArchivedTitle',
                    defaultMessage: 'No archived policies',
                  })
            }
            description={
              tab === 'live'
                ? intl.formatMessage({
                    id: 'admin.settings.sla.emptyLiveDescription',
                    defaultMessage: 'Create one, then apply it from a workflow.',
                  })
                : undefined
            }
          />
        ) : (
          <SettingsList>
            {rows.map((p) => (
              <PolicyRow
                key={p.id}
                policy={p}
                officeHoursEnabled={officeHoursEnabled}
                onEdit={() => setEditor({ mode: 'edit', policy: p })}
                onClone={() => setEditor({ mode: 'create', seed: p })}
                onArchive={() => archiveMutation.mutate(p.id)}
                onRestore={() => restoreMutation.mutate(p.id)}
              />
            ))}
          </SettingsList>
        )}
      </SettingsCard>

      {editor && (
        <PolicyEditorDialog
          key={editor.mode === 'edit' ? editor.policy.id : (editor.seed?.id ?? 'new')}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            refresh()
          }}
        />
      )}
    </SettingsPage>
  )
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function PolicyRow({
  policy,
  officeHoursEnabled,
  onEdit,
  onClone,
  onArchive,
  onRestore,
}: {
  policy: SlaPolicyDTO
  officeHoursEnabled: boolean
  onEdit: () => void
  onClone: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  const intl = useOptionalIntl()
  const isArchived = !!policy.archivedAt
  const details = [
    slaTargetsSummary(policy),
    policy.pauseOnSnooze
      ? intl.formatMessage({
          id: 'admin.settings.sla.pausesOnSnooze',
          defaultMessage: 'Pauses on snooze',
        })
      : null,
    // Only shown when the ticket clock exists; the flag is inert otherwise.
    policy.pauseOnPending && policy.timeToResolveTargetSecs
      ? intl.formatMessage({
          id: 'admin.settings.sla.pausesWhilePending',
          defaultMessage: 'Pauses while pending',
        })
      : null,
  ].filter(Boolean)
  return (
    <SettingsListRow
      title={policy.name}
      meta={details.join(' · ')}
      badges={
        officeHoursEnabled && (
          <Badge variant="secondary">
            {intl.formatMessage({
              id: 'admin.settings.sla.officeHoursBadge',
              defaultMessage: 'Office hours',
            })}
          </Badge>
        )
      }
      actions={
        isArchived
          ? [
              {
                label: intl.formatMessage({
                  id: 'admin.settings.sla.restore',
                  defaultMessage: 'Restore',
                }),
                onSelect: onRestore,
              },
            ]
          : [
              {
                label: intl.formatMessage({
                  id: 'admin.settings.sla.edit',
                  defaultMessage: 'Edit',
                }),
                onSelect: onEdit,
              },
              {
                label: intl.formatMessage({
                  id: 'admin.settings.sla.clone',
                  defaultMessage: 'Clone',
                }),
                onSelect: onClone,
              },
              {
                label: intl.formatMessage({
                  id: 'admin.settings.sla.archive',
                  defaultMessage: 'Archive',
                }),
                onSelect: onArchive,
              },
            ]
      }
    />
  )
}

// ── Editor dialog ────────────────────────────────────────────────────────────

function PolicyEditorDialog({
  editor,
  onClose,
  onSaved,
}: {
  editor: NonNullable<EditorState>
  onClose: () => void
  onSaved: () => void
}) {
  const intl = useOptionalIntl()
  const editing = editor.mode === 'edit' ? editor.policy : null
  const seed = editor.mode === 'create' ? editor.seed : editing

  const [name, setName] = useState(
    editor.mode === 'create' && editor.seed
      ? intl.formatMessage(
          { id: 'admin.settings.sla.copySuffix', defaultMessage: '{name} (copy)' },
          { name: editor.seed.name }
        )
      : (seed?.name ?? '')
  )
  const [targets, setTargets] = useState<Record<TargetKey, DurationDraft>>({
    firstResponseTargetSecs: toDraft(seed?.firstResponseTargetSecs ?? null),
    nextResponseTargetSecs: toDraft(seed?.nextResponseTargetSecs ?? null),
    timeToCloseTargetSecs: toDraft(seed?.timeToCloseTargetSecs ?? null),
    timeToResolveTargetSecs: toDraft(seed?.timeToResolveTargetSecs ?? null),
  })
  const [pauseOnSnooze, setPauseOnSnooze] = useState(seed?.pauseOnSnooze ?? true)
  const [pauseOnPending, setPauseOnPending] = useState(seed?.pauseOnPending ?? true)
  const [error, setError] = useState<string | null>(null)

  const { data: officeHours } = useQuery(slaOfficeHoursQuery)
  const officeHoursEnabled = officeHours?.officeHoursEnabled ?? false
  // The pending pause only moves the ticket's resolve clock; without a
  // time-to-resolve target the flag is inert (the policy row likewise hides
  // its chip then), so the switch stays off-limits until one is set.
  const hasResolveTarget = toSecs(targets.timeToResolveTargetSecs) != null

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = {} as Record<TargetKey, number | null>
      for (const field of TARGET_FIELDS) {
        const secs = toSecs(targets[field.key])
        if (secs === undefined) {
          throw new EditorError(
            intl.formatMessage(
              {
                id: 'admin.settings.sla.invalidTarget',
                defaultMessage: '{target}: enter a whole number',
              },
              { target: intl.formatMessage(field.message) }
            )
          )
        }
        // Targets may be added or changed, never removed once set (the server
        // enforces the same rule).
        if (editing && editing[field.key] != null && secs === null) {
          throw new EditorError(
            intl.formatMessage({
              id: 'admin.settings.sla.targetNotRemovable',
              defaultMessage: 'Targets can be changed but not removed once set',
            })
          )
        }
        parsed[field.key] = secs
      }
      if (!name.trim()) {
        throw new EditorError(
          intl.formatMessage({
            id: 'admin.settings.sla.nameRequired',
            defaultMessage: 'Give the policy a name',
          })
        )
      }
      if (Object.values(parsed).every((v) => v === null)) {
        throw new EditorError(
          intl.formatMessage({
            id: 'admin.settings.sla.targetRequired',
            defaultMessage: 'Set at least one target',
          })
        )
      }
      const payload = {
        name: name.trim(),
        ...parsed,
        pauseOnSnooze,
        pauseOnPending,
      }
      if (editing) {
        const result = await updateSlaPolicyFn({ data: { id: editing.id, ...payload } })
        if (!result.ok) throw new EditorError(result.message)
        return
      }
      await createSlaPolicyFn({ data: payload })
    },
    onSuccess: () => {
      toast.success(
        editing
          ? intl.formatMessage({
              id: 'admin.settings.sla.policyUpdated',
              defaultMessage: 'Policy updated',
            })
          : intl.formatMessage({
              id: 'admin.settings.sla.policyCreated',
              defaultMessage: 'Policy created',
            })
      )
      onSaved()
    },
    onError: (err) => {
      const failedToSave = intl.formatMessage({
        id: 'admin.settings.sla.saveFailed',
        defaultMessage: 'Failed to save policy',
      })
      if (err instanceof EditorError) setError(errorText(err, failedToSave))
      else toast.error(failedToSave)
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? intl.formatMessage({
                  id: 'admin.settings.sla.editTitle',
                  defaultMessage: 'Edit SLA policy',
                })
              : intl.formatMessage({
                  id: 'admin.settings.sla.createTitle',
                  defaultMessage: 'New SLA policy',
                })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.settings.sla.editorDescription',
              defaultMessage:
                "Response targets count from the customer's message; the resolve target clocks the linked ticket to a resolved status. Leave a target empty to skip it; at least one is required.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sla-policy-name">
              {intl.formatMessage({
                id: 'admin.settings.sla.nameLabel',
                defaultMessage: 'Name',
              })}
            </Label>
            <Input
              id="sla-policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.settings.sla.namePlaceholder',
                defaultMessage: 'e.g. Premium support',
              })}
              maxLength={120}
            />
          </div>

          <div className="space-y-2.5">
            {TARGET_FIELDS.map((field) => {
              const draft = targets[field.key]
              const locked = !!editing && editing[field.key] != null
              const fieldLabel = intl.formatMessage(field.message)
              return (
                <div key={field.key} className="flex items-center gap-2">
                  <Label htmlFor={`sla-${field.key}`} className="w-28 shrink-0 text-xs">
                    {fieldLabel}
                  </Label>
                  <Input
                    id={`sla-${field.key}`}
                    type="number"
                    min={1}
                    step={1}
                    value={draft.value}
                    onChange={(e) =>
                      setTargets((t) => ({
                        ...t,
                        [field.key]: { ...draft, value: e.target.value },
                      }))
                    }
                    placeholder={
                      locked
                        ? undefined
                        : intl.formatMessage({
                            id: 'admin.settings.sla.targetPlaceholder',
                            defaultMessage: 'Off',
                          })
                    }
                    className="h-8 w-24 text-sm"
                  />
                  <Select
                    value={draft.unit}
                    onValueChange={(unit) =>
                      setTargets((t) => ({
                        ...t,
                        [field.key]: { ...draft, unit: unit as DurationUnit },
                      }))
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-28"
                      aria-label={intl.formatMessage(
                        {
                          id: 'admin.settings.sla.targetUnitAria',
                          defaultMessage: '{target} unit',
                        },
                        { target: fieldLabel }
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(UNIT_SECS) as DurationUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>
                          {intl.formatMessage(UNIT_LABELS[u])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
            {editing && (
              <p className="text-[11px] text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.sla.targetLockNote',
                  defaultMessage:
                    'Targets can be changed but not removed once set. Edits only affect conversations the policy is applied to afterwards.',
                })}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="pr-4">
              <Label htmlFor="sla-pause-on-snooze" className="text-sm font-medium cursor-pointer">
                {intl.formatMessage({
                  id: 'admin.settings.sla.pauseOnSnooze',
                  defaultMessage: 'Pause while snoozed',
                })}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.sla.pauseOnSnoozeDescription',
                  defaultMessage: 'Stop the clocks while the conversation is snoozed.',
                })}
              </p>
            </div>
            <Switch
              id="sla-pause-on-snooze"
              checked={pauseOnSnooze}
              onCheckedChange={setPauseOnSnooze}
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="pr-4">
              <Label htmlFor="sla-pause-on-pending" className="text-sm font-medium cursor-pointer">
                {intl.formatMessage({
                  id: 'admin.settings.sla.pauseOnPending',
                  defaultMessage: 'Pause while pending',
                })}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.sla.pauseOnPendingDescription',
                  defaultMessage:
                    "Stop a ticket's resolve clock while it waits in a pending status (on the customer or a third party).",
                })}
                {!hasResolveTarget &&
                  ' ' +
                    intl.formatMessage({
                      id: 'admin.settings.sla.pauseOnPendingInert',
                      defaultMessage: 'Inert without a time-to-resolve target.',
                    })}
              </p>
            </div>
            <Switch
              id="sla-pause-on-pending"
              checked={pauseOnPending}
              onCheckedChange={setPauseOnPending}
              disabled={!hasResolveTarget}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {intl.formatMessage({
                id: 'admin.settings.sla.businessHours',
                defaultMessage: 'Business hours',
              })}
            </Label>
            <p className="text-xs text-muted-foreground">
              {officeHoursEnabled ? (
                intl.formatMessage({
                  id: 'admin.settings.sla.businessHoursEnabled',
                  defaultMessage: 'Clocks count only time inside your workspace office hours.',
                })
              ) : (
                <FormattedMessage
                  id="admin.settings.sla.businessHoursDisabled"
                  defaultMessage="Clocks run around the clock. {link} to make clocks count only open time."
                  values={{
                    link: (
                      <Link to="/admin/settings/office-hours" className={INLINE_LINK}>
                        {intl.formatMessage({
                          id: 'admin.settings.officeHours.enableLabel',
                          defaultMessage: 'Set office hours',
                        })}
                      </Link>
                    ),
                  }}
                />
              )}
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {intl.formatMessage({
              id: 'common.cancel',
              defaultMessage: 'Cancel',
            })}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setError(null)
              saveMutation.mutate()
            }}
            disabled={saveMutation.isPending}
          >
            {editing
              ? intl.formatMessage({
                  id: 'admin.settings.sla.saveChanges',
                  defaultMessage: 'Save changes',
                })
              : intl.formatMessage({
                  id: 'admin.settings.sla.createPolicy',
                  defaultMessage: 'Create policy',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Validation errors surfaced inline in the dialog (vs. an error toast). */
class EditorError extends Error {}
