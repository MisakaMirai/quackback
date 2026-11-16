/**
 * Email settings, in two parts. The workspace part (Settings → Email) holds the
 * sending addresses and which of them each kind of email is sent from, because
 * feedback, changelog and status email send whether or not Support is on. The
 * support part (Support → Channels → Email) holds the support inbox and where
 * support replies come from. An address on a domain that is not live yet
 * carries that domain's setup panel under it.
 */
import { useRef, useState } from 'react'
import { type IntlShape } from 'react-intl'
import { Link } from '@tanstack/react-router'
import { EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { toast } from 'sonner'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { RowIcon, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PhaseBadge } from './phase-badge'
import {
  useCreateInboundRoute,
  useRestartSendingDomainChecks,
  useSendTestEmail,
  useUpdateInboundTrust,
  useClearInboundForwarding,
} from '@/lib/client/mutations/channel-accounts'
import type { EmailSendersDTO, SendingDomainDTO } from '@/lib/server/functions/channel-accounts'
import { DomainSetupPanel } from './domain-setup-panel'
import {
  domainOf,
  removalNote,
  RemoveAddressDialog,
  RemoveDomainDialog,
  type AddressRemoval,
  type DomainRemoval,
  type SendingAddress,
} from './sending-removal'
import { SendingPausedNotice } from './sending-paused-notice'
import { SendFromCard, type SenderSurfaceKey } from './send-from-card'
import {
  inboundTarget,
  oldestFirst,
  senderLabel,
  useEmailConfigView,
  type AddressMode,
} from './email-config-view'
import { errorText } from '@/lib/client/error-text'
import { SendingAddressDialog, type SendingAddressDialogTarget } from './sending-address-dialog'
import {
  domainPhase,
  failingRecordName,
  ownershipWarning,
  signingKeyFailing,
  signingKeyProblem,
  type DomainPhase,
} from './sending-domain-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/shared/utils'
import { toastError } from '@/lib/client/error-notice'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

/**
 * Settings → Email: the addresses this workspace sends from, and which of them
 * the default and each product that is on uses.
 */
export function WorkspaceEmailSettings({ surfaces }: { surfaces: readonly SenderSurfaceKey[] }) {
  const intl = useOptionalIntl()
  const view = useEmailConfigView()
  const { data } = view
  return (
    <div className="space-y-6">
      <SendingPausedNotice
        paused={data?.sendingPaused ?? null}
        ownServer={data?.addressMode === 'any'}
      />
      <SendingAddressesSection
        addresses={view.addresses}
        domains={view.domains}
        senders={view.senders}
        workspaceName={view.workspaceName}
        platformFrom={view.platformFrom}
        platformName={view.platformName}
        addressMode={view.addressMode}
        ownDomains={view.ownDomains}
        loaded={data !== undefined}
      />
      {/* With no address there is nothing to choose between, so the card
          waits for one rather than showing a row of single-option selects. */}
      {view.addresses.length > 0 && (
        <SendFromCard
          {...view.sendFrom}
          rows={['default', ...surfaces]}
          // Where "Change" on a product's page lands: `SEND_FROM_ANCHOR` in
          // surface-sender-row.tsx, repeated here because importing that row
          // would load it with this page. A test holds the two together.
          id="send-from"
          onError={(error) =>
            toastError(
              error,
              intl.formatMessage({
                id: 'admin.channels.email.sendFromChangeFailed',
                defaultMessage: "Couldn't change where email is sent from.",
              })
            )
          }
        />
      )}
    </div>
  )
}

/**
 * Support → Channels → Email: the support inbox, and the one sender a support
 * lead may choose, where support replies come from. The addresses themselves
 * are managed on Settings → Email.
 */
export function SupportInboxSettings({ canManageSending }: { canManageSending: boolean }) {
  const intl = useOptionalIntl()
  const view = useEmailConfigView()
  const { data } = view
  return (
    <div className="space-y-6">
      <SendingPausedNotice
        paused={data?.sendingPaused ?? null}
        ownServer={data?.addressMode === 'any'}
      />
      <InboundRouteSection
        forwardingTarget={inboundTarget(data?.inboundRoute)}
        platformAddress={data?.platformAddress ?? null}
        inboundTrust={data?.inboundRoute?.inboundTrust ?? 'strict'}
      />
      <SendFromCard
        {...view.sendFrom}
        rows={['support']}
        title={intl.formatMessage({
          id: 'admin.channels.email.repliesTitle',
          defaultMessage: 'Replies',
        })}
        description={
          canManageSending
            ? intl.formatMessage({
                id: 'admin.channels.email.repliesDescription',
                defaultMessage: 'The address support replies come from.',
              })
            : intl.formatMessage({
                id: 'admin.channels.email.repliesDescriptionAdmin',
                defaultMessage:
                  'The address support replies come from. An admin adds sending addresses in Settings > Email.',
              })
        }
        action={
          canManageSending ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/settings/email">
                {intl.formatMessage({
                  id: 'admin.channels.email.manageAddresses',
                  defaultMessage: 'Manage sending addresses',
                })}
              </Link>
            </Button>
          ) : undefined
        }
        onError={(error) =>
          toastError(
            error,
            intl.formatMessage({
              id: 'admin.channels.email.supportReplyChangeFailed',
              defaultMessage: "Couldn't change where support replies come from.",
            })
          )
        }
      />
    </div>
  )
}

/** How the two inbound trust settings are offered. */
const TRUST_OPTIONS = [
  {
    value: 'strict',
    id: 'admin.channels.email.trustQuarantine',
    defaultMessage: 'Quarantine',
  },
  {
    value: 'lenient',
    id: 'admin.channels.email.trustAccept',
    defaultMessage: 'Accept',
  },
] as const

function InboundRouteSection({
  forwardingTarget,
  platformAddress,
  inboundTrust,
}: {
  forwardingTarget: string | null
  platformAddress: string | null
  inboundTrust: 'strict' | 'lenient'
}) {
  const intl = useOptionalIntl()
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // One inline line for the last failed action, as on the Sending addresses card.
  const [actionError, setActionError] = useState<string | null>(null)
  const create = useCreateInboundRoute()
  const clear = useClearInboundForwarding()
  const trust = useUpdateInboundTrust()
  const showError = (fallback: string) => (error: unknown) =>
    setActionError(errorText(error, fallback))

  const showEditor = !forwardingTarget || editing

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.channels.email.supportInboxTitle',
        defaultMessage: 'Support inbox',
      })}
      description={intl.formatMessage({
        id: 'admin.channels.email.supportInboxDescription',
        defaultMessage: 'Forward your support address here so its email becomes conversations.',
      })}
    >
      {platformAddress && (
        <p className="mb-4 text-[13px] text-muted-foreground">
          {intl.formatMessage(
            {
              id: 'admin.channels.email.platformAddressNote',
              defaultMessage: 'Email to {address} becomes a conversation.',
            },
            { address: platformAddress }
          )}
        </p>
      )}
      {forwardingTarget && !editing ? (
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium truncate">{forwardingTarget}</p>
            {platformAddress && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {intl.formatMessage(
                  {
                    id: 'admin.channels.email.forwardingTo',
                    defaultMessage: 'Forwarding to {address}',
                  },
                  { address: platformAddress }
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValue(forwardingTarget)
                setEditing(true)
              }}
            >
              {intl.formatMessage({ id: 'inbox.action.edit', defaultMessage: 'Edit' })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={clear.isPending}
              onClick={() => setConfirmClear(true)}
            >
              {intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' })}
            </Button>
          </div>
        </div>
      ) : showEditor ? (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="fwd">
              {intl.formatMessage({
                id: 'admin.channels.email.forwardingAddress',
                defaultMessage: 'Forwarding address',
              })}
            </Label>
            <Input
              id="fwd"
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.channels.email.forwardingPlaceholder',
                defaultMessage: 'support@yourcompany.com',
              })}
            />
          </div>
          <Button
            variant="outline"
            disabled={!value.trim() || create.isPending}
            onClick={() => {
              setActionError(null)
              create.mutate(value.trim(), {
                onSuccess: () => {
                  setValue('')
                  setEditing(false)
                },
                onError: showError(
                  intl.formatMessage({
                    id: 'admin.channels.email.forwardingSaveFailed',
                    defaultMessage: "Couldn't save the forwarding address.",
                  })
                ),
              })
            }}
          >
            {intl.formatMessage({ id: 'admin.channels.email.save', defaultMessage: 'Save' })}
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4">
        <div className="pr-4">
          <p className="text-sm font-medium">
            {intl.formatMessage({
              id: 'admin.channels.email.unverifiedSenders',
              defaultMessage: 'Unverified senders',
            })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.channels.email.unverifiedDescription',
              defaultMessage:
                'Quarantine moves email that fails authentication to Spam. Accept lets it in, marked unverified.',
            })}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label={intl.formatMessage({
            id: 'admin.channels.email.unverifiedSenders',
            defaultMessage: 'Unverified senders',
          })}
          className="inline-flex shrink-0 rounded-lg border border-border p-0.5"
        >
          {TRUST_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={inboundTrust === option.value}
              disabled={trust.isPending}
              onClick={() => {
                setActionError(null)
                trust.mutate(option.value, {
                  onError: showError(
                    intl.formatMessage({
                      id: 'admin.channels.email.unverifiedChangeFailed',
                      defaultMessage: "Couldn't change unverified senders.",
                    })
                  ),
                })
              }}
              className={cn(
                'rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                inboundTrust === option.value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {intl.formatMessage(option)}
            </button>
          ))}
        </div>
      </div>
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {actionError}
        </p>
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={intl.formatMessage({
          id: 'admin.channels.email.forwardingRemoveTitle',
          defaultMessage: 'Remove the forwarding address?',
        })}
        description={intl.formatMessage({
          id: 'admin.channels.email.forwardingRemoveDescription',
          defaultMessage:
            'Forwarded email stops becoming conversations until you set an address again.',
        })}
        confirmLabel={intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' })}
        variant="destructive"
        isPending={clear.isPending}
        onConfirm={() => {
          setActionError(null)
          clear.mutate(undefined, {
            onError: showError(
              intl.formatMessage({
                id: 'admin.channels.email.forwardingRemoveFailed',
                defaultMessage: "Couldn't remove the forwarding address.",
              })
            ),
          })
          setConfirmClear(false)
        }}
      />
    </SettingsCard>
  )
}

/**
 * A row's icon from sm up. On a phone the tile is left out: every row carries
 * the same one, and its width is what lets an address sit on one line.
 */
function PhoneHiddenIcon({ icon }: { icon: typeof EnvelopeIcon }) {
  return (
    <div className="hidden sm:block">
      <RowIcon icon={icon} />
    </div>
  )
}

/** The meta line of a row whose domain is not live yet, or is live with its ownership record missing. */
function pendingMeta(
  intl: IntlShape,
  domain: SendingDomainDTO,
  phase: DomainPhase,
  first: boolean,
  detail: string
): string | null {
  if (phase === 'live') {
    const warning = first ? ownershipWarning(domain) : null
    return warning
      ? intl.formatMessage(
          {
            id: 'admin.channels.email.verificationRecordMissing',
            defaultMessage: 'The verification record is missing. {warning}',
          },
          { warning }
        )
      : null
  }
  if (!first) {
    return intl.formatMessage(
      {
        id: 'admin.channels.email.waitingForDomain',
        defaultMessage: 'Waiting for {domain} to be verified',
      },
      { domain: domain.domain }
    )
  }
  if (signingKeyFailing(domain, phase)) return `${signingKeyProblem(domain.domain)} ${detail}`
  if (phase === 'not-found') {
    return intl.formatMessage(
      {
        id: 'admin.channels.email.recordsNotFound',
        defaultMessage: 'Records not found after 72 hours. {detail}',
      },
      { detail }
    )
  }
  if (phase === 'attention') {
    const failing = domain.dnsRecords.find((r) => r.check && r.check.state !== 'found')
    const name = failingRecordName(domain)
    if (failing && name) {
      const what =
        failing.check?.state === 'missing'
          ? intl.formatMessage({
              id: 'admin.channels.email.recordIsMissing',
              defaultMessage: 'is missing',
            })
          : failing.check?.state === 'proxied'
            ? intl.formatMessage({
                id: 'admin.channels.email.recordIsProxied',
                defaultMessage: 'is proxied',
              })
            : intl.formatMessage({
                id: 'admin.channels.email.recordWrongValue',
                defaultMessage: 'has the wrong value',
              })
      return intl.formatMessage(
        {
          id: 'admin.channels.email.recordProblem',
          defaultMessage: 'The {name} {problem}. {detail}',
        },
        { name, problem: what, detail }
      )
    }
    return intl.formatMessage(
      {
        id: 'admin.channels.email.domainNeedsAttention',
        defaultMessage: '{domain} needs attention. {detail}',
      },
      { domain: domain.domain, detail }
    )
  }
  return null
}

function SendingAddressesSection({
  addresses,
  domains,
  senders,
  workspaceName,
  platformFrom,
  platformName,
  addressMode,
  ownDomains: platformDomains,
  loaded,
}: {
  addresses: SendingAddress[]
  domains: SendingDomainDTO[]
  senders: EmailSendersDTO
  workspaceName: string
  platformFrom: string | null
  platformName: string
  /**
   * `unavailable`: no custom addresses here. `any`: one workspace, so email
   * still leaves as the address and nothing falls back. `verified-domains`:
   * shared, and a new domain brings records to add.
   */
  addressMode: AddressMode | undefined
  /** The platform's own domains, which an address needs no setup to send from. */
  ownDomains: readonly string[]
  /** Whether the config has arrived, so an empty list really is empty. */
  loaded: boolean
}) {
  const intl = useOptionalIntl()
  const available = addressMode !== 'unavailable'
  const guardPermitsAny = addressMode === 'any'
  const [dialog, setDialog] = useState<SendingAddressDialogTarget | null>(null)
  // The Add address button on show (the card's, or the empty card's), and
  // whether it opened the dialog: focus goes back to it when the dialog
  // closes. A rename opens from a row's menu, which takes focus back itself.
  const addButton = useRef<HTMLButtonElement>(null)
  const openedByAdd = useRef(false)
  const openAdd = () => {
    openedByAdd.current = true
    setDialog({ kind: 'add' })
  }
  const [domainRemoveTarget, setDomainRemoveTarget] = useState<DomainRemoval | null>(null)
  const [removeTarget, setRemoveTarget] = useState<AddressRemoval | null>(null)
  // Records of live domains the person opened from the row menu, by domain.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // One inline line for the last failed action, cleared when the next starts:
  // these failures name a fix, and a toast is gone before it is read.
  const [actionError, setActionError] = useState<string | null>(null)
  const restart = useRestartSendingDomainChecks()
  const sendTest = useSendTestEmail()
  const showError = (fallback: string) => (error: unknown) =>
    setActionError(errorText(error, fallback))
  const now = new Date()
  // What email does meanwhile: one workspace still sends as the address; a
  // shared server falls back to the default.
  const fallbackNote = guardPermitsAny
    ? intl.formatMessage({
        id: 'admin.channels.email.fallbackStillSends',
        defaultMessage:
          'Email is still sent from this address, but it may land in spam until this is fixed.',
      })
    : intl.formatMessage({
        id: 'admin.channels.email.fallbackDefault',
        defaultMessage: "Email comes from your default address until it's fixed.",
      })

  // Listed oldest first: the panel and the domain's status line sit under the
  // address that has been on the domain longest, so adding another one does
  // not move them.
  const rows = oldestFirst(addresses).map((a) => {
    const domain = domainOf(a, domains)
    return { a, domain, phase: domain ? domainPhase(domain, now) : ('live' as const) }
  })
  const firstOnDomain = new Set<string>()
  const seen = new Set<string>()
  for (const { a, domain } of rows) {
    if (domain && !seen.has(domain.id)) {
      seen.add(domain.id)
      firstOnDomain.add(a.id)
    }
  }
  // Domains no address uses: added before addresses brought their domains,
  // or left behind. Listed so they can be finished or removed.
  const unused = domains
    .filter((d) => !rows.some((r) => r.domain?.id === d.id))
    .map((d) => ({ domain: d, phase: domainPhase(d, now) }))
  const setupPanel = (domain: SendingDomainDTO, phase: DomainPhase) => (
    <DomainSetupPanel
      domain={domain}
      phase={phase}
      checking={restart.isPending}
      onCheckAgain={() => {
        setActionError(null)
        restart.mutate(domain.id, {
          onError: showError(
            intl.formatMessage({
              id: 'admin.channels.email.checkFailed',
              defaultMessage: "Couldn't check the records.",
            })
          ),
        })
      }}
    />
  )

  // Nothing added and nothing left over: the card says what email comes from
  // today and offers the one next step, in place of an empty list.
  const empty = loaded && rows.length === 0 && unused.length === 0

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.channels.email.addressesTitle',
        defaultMessage: 'Sending addresses',
      })}
      flush
      // The empty state carries its own, as the one thing to do there.
      action={
        empty ? undefined : (
          <Button
            ref={addButton}
            variant="outline"
            size="sm"
            disabled={!available}
            onClick={openAdd}
          >
            {intl.formatMessage({
              id: 'admin.channels.email.addAddress',
              defaultMessage: 'Add address',
            })}
          </Button>
        )
      }
    >
      <SettingsList>
        {rows.map(({ a, domain, phase }) => {
          const first = firstOnDomain.has(a.id)
          // A live domain whose ownership record went missing still needs a record.
          const warned = !!domain && first && ownershipWarning(domain) !== null
          // Always open while the domain needs its records; opened from the menu once live.
          const open = domain ? phase !== 'live' || (expanded[domain.id] ?? warned) : false
          const address = a.address ?? ''
          const title = senderLabel(a, workspaceName)
          // Testable wherever real sends would use the address: a live domain,
          // or any address on a server whose guard permits every From.
          const testable = guardPermitsAny || (!!domain && phase === 'live')
          const items = [
            {
              label: intl.formatMessage({
                id: 'admin.channels.email.editName',
                defaultMessage: 'Edit name',
              }),
              onSelect: () => {
                openedByAdd.current = false
                setDialog({ kind: 'rename', id: a.id, address, senderName: a.senderName ?? null })
              },
            },
            ...(domain && first && phase === 'live'
              ? [
                  {
                    label: open
                      ? intl.formatMessage({
                          id: 'admin.channels.email.hideDnsRecords',
                          defaultMessage: 'Hide DNS records',
                        })
                      : intl.formatMessage({
                          id: 'admin.channels.email.dnsRecords',
                          defaultMessage: 'DNS records',
                        }),
                    onSelect: () => setExpanded((e) => ({ ...e, [domain.id]: !open })),
                  },
                ]
              : []),
            {
              label: intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' }),
              destructive: true,
              onSelect: () =>
                setRemoveTarget({
                  id: a.id,
                  address: a.address ?? '',
                  // Removing the last address on a domain removes the domain too.
                  alsoDomain:
                    domain && rows.filter((r) => r.domain?.id === domain.id).length === 1
                      ? domain.domain
                      : null,
                  note: removalNote(a.id, senders, platformFrom, platformName),
                }),
            },
          ]
          return (
            <div key={a.id}>
              <SettingsListRow
                leading={<PhoneHiddenIcon icon={EnvelopeIcon} />}
                title={title}
                meta={
                  (domain && pendingMeta(intl, domain, phase, first, fallbackNote)) || undefined
                }
                wrapMeta={phase !== 'live' || warned}
                badges={<PhaseBadge phase={phase} />}
                trailing={
                  testable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendTest.isPending}
                      onClick={() => {
                        setActionError(null)
                        sendTest.mutate(a.id, {
                          onSuccess: (r) =>
                            toast.success(
                              intl.formatMessage(
                                {
                                  id: 'admin.channels.email.testSent',
                                  defaultMessage: 'Test email sent to {address}',
                                },
                                { address: r.to }
                              )
                            ),
                          onError: showError(
                            intl.formatMessage({
                              id: 'admin.channels.email.testFailed',
                              defaultMessage: "Couldn't send the test email.",
                            })
                          ),
                        })
                      }}
                    >
                      {intl.formatMessage({
                        id: 'admin.channels.email.sendTest',
                        defaultMessage: 'Send test',
                      })}
                    </Button>
                  ) : undefined
                }
                actions={items}
              />
              {domain && first && open && setupPanel(domain, phase)}
            </div>
          )
        })}
        {unused.map(({ domain, phase }) => {
          const open = phase !== 'live' || (expanded[domain.id] ?? false)
          return (
            <div key={domain.id}>
              <SettingsListRow
                leading={<PhoneHiddenIcon icon={GlobeAltIcon} />}
                title={domain.domain}
                meta={intl.formatMessage({
                  id: 'admin.channels.email.unusedDomain',
                  defaultMessage: 'No address uses this domain',
                })}
                badges={<PhaseBadge phase={phase} />}
                actions={[
                  ...(phase === 'live'
                    ? [
                        {
                          label: open
                            ? intl.formatMessage({
                                id: 'admin.channels.email.hideDnsRecords',
                                defaultMessage: 'Hide DNS records',
                              })
                            : intl.formatMessage({
                                id: 'admin.channels.email.dnsRecords',
                                defaultMessage: 'DNS records',
                              }),
                          onSelect: () => setExpanded((e) => ({ ...e, [domain.id]: !open })),
                        },
                      ]
                    : []),
                  {
                    label: intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' }),
                    destructive: true,
                    onSelect: () => setDomainRemoveTarget({ id: domain.id, domain: domain.domain }),
                  },
                ]}
              />
              {open && setupPanel(domain, phase)}
            </div>
          )
        })}
      </SettingsList>
      {empty ? (
        <EmptyState
          size="compact"
          icon={EnvelopeIcon}
          title={intl.formatMessage({
            id: 'admin.channels.email.emptyTitle',
            defaultMessage: 'No sending addresses yet',
          })}
          description={
            !available
              ? intl.formatMessage({
                  id: 'admin.channels.email.emptyUnavailable',
                  defaultMessage: "Custom sending addresses aren't available on this server.",
                })
              : platformFrom
                ? intl.formatMessage(
                    {
                      id: 'admin.channels.email.emptyPlatform',
                      defaultMessage:
                        'Email comes from {address}. Add an address to send from your own domain.',
                    },
                    { address: platformFrom }
                  )
                : intl.formatMessage({
                    id: 'admin.channels.email.emptyAdd',
                    defaultMessage: 'Add an address to send email from your own domain.',
                  })
          }
          action={
            available ? (
              <Button ref={addButton} variant="outline" onClick={openAdd}>
                {intl.formatMessage({
                  id: 'admin.channels.email.addAddress',
                  defaultMessage: 'Add address',
                })}
              </Button>
            ) : undefined
          }
        />
      ) : !available || actionError ? (
        <div className="space-y-2 border-t border-border/50 px-4 py-3 sm:px-6">
          {!available && (
            <p className="text-[13px] text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.channels.email.emptyUnavailable',
                defaultMessage: "Custom sending addresses aren't available on this server.",
              })}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
        </div>
      ) : null}
      <SendingAddressDialog
        target={dialog}
        workspaceName={workspaceName}
        domains={domains}
        setsUpDomains={addressMode === 'verified-domains'}
        ownDomains={platformDomains}
        onClose={() => setDialog(null)}
        finalFocus={() => (openedByAdd.current ? addButton.current : true)}
      />
      <RemoveAddressDialog
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onStart={() => setActionError(null)}
        onError={showError}
      />
      <RemoveDomainDialog
        target={domainRemoveTarget}
        onClose={() => setDomainRemoveTarget(null)}
        onStart={() => setActionError(null)}
        onError={showError}
      />
    </SettingsCard>
  )
}
