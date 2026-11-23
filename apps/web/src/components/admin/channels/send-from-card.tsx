/**
 * Which address email is sent from: the workspace default, and beside it only
 * the kinds of email (support, the feedback board, the changelog, the status
 * page) that send from something else. Support can also reply from the
 * address the customer wrote to, once the workspace receives email.
 */
import { useState } from 'react'
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSetEmailSender } from '@/lib/client/mutations/channel-accounts'
import type { EmailSenderChoiceDTO, EmailSendersDTO } from '@/lib/server/functions/channel-accounts'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

/** An address the page can offer, already named and checked. */
export type SenderIdentity = {
  id: string
  /** "Sender name <address>". */
  label: string
  /** Whether its domain is verified, so mail actually sends from it. */
  live: boolean
  /** Not live because its domain was verified once and stopped, not because it never was. */
  lapsed?: boolean
}

type Surface = keyof EmailSendersDTO

/** A kind of email with its own sender, other than the workspace default. */
export type SenderSurfaceKey = Exclude<Surface, 'default'>

/** What each kind of email with its own sender is called, in the order shown. */
export const SENDER_SURFACE_NAMES: Record<SenderSurfaceKey, string> = {
  support: 'Support',
  feedback: 'Feedback board',
  changelog: 'Changelog',
  status: 'Status page',
}

/** The translated label for each kind of email, for this card's own copy. */
export const SURFACE_LABEL: Record<SenderSurfaceKey, { id: string; defaultMessage: string }> = {
  support: { id: 'admin.channels.sendFrom.surfaceSupport', defaultMessage: 'Support' },
  feedback: { id: 'admin.channels.sendFrom.surfaceFeedback', defaultMessage: 'Feedback board' },
  changelog: { id: 'admin.channels.sendFrom.surfaceChangelog', defaultMessage: 'Changelog' },
  status: { id: 'admin.channels.sendFrom.surfaceStatus', defaultMessage: 'Status page' },
}

/** The kinds of email with their own sender, in the order shown. */
export const SENDER_SURFACES = Object.keys(SENDER_SURFACE_NAMES) as SenderSurfaceKey[]

const OVERRIDES: readonly { surface: SenderSurfaceKey }[] = SENDER_SURFACES.map((surface) => ({
  surface,
}))

const ALL_ROWS: readonly Surface[] = ['default', ...OVERRIDES.map((o) => o.surface)]

/**
 * The address picker: its fixed width from sm up; on a phone, where its row
 * stacks it under the label, whatever the row has left beside the reset button.
 */
const TRIGGER = 'min-w-0 flex-1 sm:w-72 sm:flex-none lg:w-96'

const PLATFORM = '__platform'
const SAME_AS_DEFAULT = '__default'
const INBOX = '__inbox'

/** The Select value for a surface's choice. */
function valueOf(choice: EmailSenderChoiceDTO | null, surface: Surface): string {
  if (!choice) return surface === 'default' ? PLATFORM : SAME_AS_DEFAULT
  return choice.mode === 'inbox' ? INBOX : choice.id
}

/** The choice a Select value stands for. */
function choiceOf(value: string): EmailSenderChoiceDTO | null {
  if (value === PLATFORM || value === SAME_AS_DEFAULT) return null
  if (value === INBOX) return { mode: 'inbox' }
  return { mode: 'address', id: value }
}

/** The addr-spec of a "Name <address>" label: its last bracketed part. */
const addressOf = (label: string): string => /<([^<>]+)>\s*$/.exec(label)?.[1] ?? label

/** The domain of an address, which is what gets verified. */
const domainOf = (address: string): string => address.slice(address.lastIndexOf('@') + 1)

export function SendFromCard({
  senders,
  identities,
  platformFrom,
  platformName,
  platformInbox,
  forwardingTarget,
  forwardingTargetPermitted,
  hasInboundRoute,
  rows = ALL_ROWS,
  title,
  description,
  action,
  id,
  onError,
}: {
  senders: EmailSendersDTO
  identities: SenderIdentity[]
  /** "Workspace <platform address>", or null when this install has none. */
  platformFrom: string | null
  /** What the address email sends from with nothing chosen is called here. */
  platformName: string
  /**
   * "Workspace <its inbox on the platform>", when it has one: what a reply to
   * an emailed-in conversation falls back to before the platform address.
   */
  platformInbox: string | null
  forwardingTarget: string | null
  forwardingTargetPermitted: boolean | null
  /** Whether the workspace receives email, so support can reply from the inbox. */
  hasInboundRoute: boolean
  /**
   * The rows to show, in their usual order: the workspace page shows the
   * default and the products that are on; the support inbox page shows only
   * support. A row left out keeps its choice.
   */
  rows?: readonly Surface[]
  title?: string
  description?: string
  action?: React.ReactNode
  /** An anchor for a link that lands on this card. */
  id?: string
  onError: (error: unknown) => void
}) {
  const intl = useOptionalIntl()
  const setSender = useSetEmailSender()

  /** How long a stand-in lasts: a new address is waiting, a lapsed one needs a fix. */
  const untilWhen = (identity: SenderIdentity): string =>
    identity.lapsed
      ? intl.formatMessage({
          id: 'admin.channels.sendFrom.untilFixed',
          defaultMessage: "until it's fixed",
        })
      : intl.formatMessage({ id: 'admin.channels.sendFrom.forNow', defaultMessage: 'for now' })

  /** "help@acme.com isn't verified yet", or "is no longer verified" once it was. */
  const cannotSend = (identity: SenderIdentity): string =>
    intl.formatMessage(
      identity.lapsed
        ? {
            id: 'admin.channels.sendFrom.noLongerVerified',
            defaultMessage: '{address} is no longer verified',
          }
        : {
            id: 'admin.channels.sendFrom.notVerifiedYet',
            defaultMessage: "{address} isn't verified yet",
          },
      { address: addressOf(identity.label) }
    )

  // Verified addresses, plus whatever is chosen now so a demoted one still reads.
  const optionsFor = (surface: Surface) => {
    const chosen = senders[surface]
    const chosenId = chosen?.mode === 'address' ? chosen.id : null
    return identities.filter((i) => i.live || i.id === chosenId)
  }
  const choose = (surface: Surface, value: string) =>
    setSender.mutate({ surface, choice: choiceOf(value) }, { onError })

  const defaultChoice = senders.default
  const defaultIdentity =
    defaultChoice?.mode === 'address'
      ? identities.find((i) => i.id === defaultChoice.id && i.live)
      : undefined
  // What "the default" sends from today.
  const resolvedDefault = defaultIdentity?.label ?? platformFrom

  const defaultHint = defaultChoice
    ? undefined
    : platformFrom
      ? intl.formatMessage(
          {
            id: 'admin.channels.sendFrom.emailComesFrom',
            defaultMessage: 'Email comes from {address}.',
          },
          { address: platformFrom }
        )
      : intl.formatMessage({
          id: 'admin.channels.sendFrom.defaultMissing',
          defaultMessage: "No default address is set, so email can't be sent until you choose one.",
        })
  // A chosen address whose domain stopped verifying (or never finished) is
  // still shown as chosen; this says what mail goes out from meanwhile.
  const notLiveHint = (surface: Surface): string | undefined => {
    const choice = senders[surface]
    if (choice?.mode !== 'address') return undefined
    const identity = identities.find((i) => i.id === choice.id)
    const fallback = surface === 'default' ? platformFrom : resolvedDefault
    if (!identity || identity.live || !fallback) return undefined
    return intl.formatMessage(
      {
        id: 'admin.channels.sendFrom.notLive',
        defaultMessage: '{state}, so email comes from {fallback} {until}.',
      },
      { state: cannotSend(identity), fallback, until: untilWhen(identity) }
    )
  }
  // The address behind the inbox, when support replies from the inbox and has
  // one: support email that is not a reply to the inbox leaves from it.
  const support = senders.support
  const behindInbox =
    support?.mode === 'inbox' && support.fallbackId
      ? identities.find((i) => i.id === support.fallbackId)
      : undefined
  // Said only when what happens differs from what is chosen. A reply that
  // cannot leave from the inbox address leaves from the address behind the
  // inbox, else the default, else the workspace's own inbox on the platform,
  // else the platform address.
  const inboxFallback =
    (behindInbox?.live ? behindInbox.label : undefined) ??
    defaultIdentity?.label ??
    platformInbox ??
    platformFrom
  const supportHint =
    support?.mode === 'inbox' &&
    forwardingTarget &&
    forwardingTargetPermitted === false &&
    inboxFallback
      ? intl.formatMessage(
          {
            id: 'admin.channels.sendFrom.repliesNotVerified',
            defaultMessage: "{domain} isn't verified, so replies come from {fallback}.",
          },
          { domain: domainOf(forwardingTarget), fallback: inboxFallback }
        )
      : undefined
  const behindInboxHint = !behindInbox
    ? undefined
    : behindInbox.live
      ? intl.formatMessage(
          {
            id: 'admin.channels.sendFrom.inboxUses',
            defaultMessage: 'Conversations not started by email use {address}.',
          },
          { address: behindInbox.label }
        )
      : resolvedDefault
        ? intl.formatMessage(
            {
              id: 'admin.channels.sendFrom.inboxNotLive',
              defaultMessage:
                '{state}, so conversations not started by email use {fallback} {until}.',
            },
            {
              state: cannotSend(behindInbox),
              fallback: resolvedDefault,
              until: untilWhen(behindInbox),
            }
          )
        : undefined

  const showDefault = rows.includes('default')
  const surfaces = OVERRIDES.filter(({ surface }) => rows.includes(surface))
  // Support can reply from the inbox only while the workspace has one.
  const offersInbox = (surface: Surface) => surface === 'support' && hasInboundRoute
  // A kind of email sends from its own choice: an address, or the inbox where
  // there is one. Anything else is the default.
  const isException = (surface: Surface) => {
    const choice = senders[surface]
    return choice?.mode === 'address' || (choice?.mode === 'inbox' && offersInbox(surface))
  }

  // Beside the default, only the kinds of email that differ from it are listed,
  // so a workspace that sends everything from one address sees one row. A kind
  // picked from the menu is listed without a choice until one is made.
  const [picked, setPicked] = useState<Surface[]>([])
  const listed = showDefault
    ? surfaces.filter(({ surface }) => isException(surface) || picked.includes(surface))
    : surfaces
  const addable = showDefault
    ? surfaces.filter(
        ({ surface }) =>
          !listed.some((l) => l.surface === surface) &&
          (optionsFor(surface).length > 0 || offersInbox(surface))
      )
    : []
  const drop = (surface: Surface) => {
    setPicked((current) => current.filter((s) => s !== surface))
    if (senders[surface]) setSender.mutate({ surface, choice: null }, { onError })
  }

  const row = ({ surface }: (typeof OVERRIDES)[number]) => {
    const id = `send-from-${surface}`
    const exception = isException(surface)
    const surfaceLabel = intl.formatMessage(SURFACE_LABEL[surface])
    // On its own page the row is the card's one setting, named for what it
    // does; beside the default it is named for the kind of email.
    const rowLabel =
      !showDefault && surface === 'support'
        ? intl.formatMessage({
            id: 'admin.channels.sendFrom.replyFrom',
            defaultMessage: 'Reply from',
          })
        : surfaceLabel
    const value = exception
      ? valueOf(senders[surface], surface)
      : showDefault
        ? ''
        : SAME_AS_DEFAULT
    return (
      <SettingRow
        key={surface}
        stackOnPhone
        label={rowLabel}
        htmlFor={id}
        description={
          (surface === 'support' ? (supportHint ?? behindInboxHint) : undefined) ??
          notLiveHint(surface) ??
          (!showDefault && !exception && resolvedDefault
            ? surface === 'support'
              ? intl.formatMessage(
                  {
                    id: 'admin.channels.sendFrom.repliesComeFrom',
                    defaultMessage: 'Replies come from {address}.',
                  },
                  { address: resolvedDefault }
                )
              : intl.formatMessage(
                  {
                    id: 'admin.channels.sendFrom.emailComesFrom',
                    defaultMessage: 'Email comes from {address}.',
                  },
                  { address: resolvedDefault }
                )
            : undefined)
        }
        control={
          <>
            <Select
              value={value}
              disabled={setSender.isPending}
              onValueChange={(v) => choose(surface, String(v))}
            >
              <SelectTrigger id={id} className={TRIGGER} aria-label={rowLabel}>
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.channels.sendFrom.chooseAddress',
                    defaultMessage: 'Choose an address',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {offersInbox(surface) && (
                  <SelectItem value={INBOX}>
                    {intl.formatMessage({
                      id: 'admin.channels.sendFrom.customerAddress',
                      defaultMessage: 'Address the customer wrote to',
                    })}
                  </SelectItem>
                )}
                {!showDefault && (
                  <SelectItem value={SAME_AS_DEFAULT}>
                    {intl.formatMessage({
                      id: 'admin.channels.sendFrom.workspaceDefault',
                      defaultMessage: 'Workspace default',
                    })}
                  </SelectItem>
                )}
                {optionsFor(surface).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showDefault && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={intl.formatMessage(
                  {
                    id: 'admin.channels.sendFrom.useDefaultAria',
                    defaultMessage: 'Use the default for {label}',
                  },
                  { label: surfaceLabel }
                )}
                className="text-muted-foreground"
                disabled={setSender.isPending}
                onClick={() => drop(surface)}
              >
                <XMarkIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
          </>
        }
      />
    )
  }

  const cardTitle =
    title ??
    intl.formatMessage({ id: 'admin.channels.sendFrom.title', defaultMessage: 'Send from' })
  const cardDescription =
    description ??
    intl.formatMessage({
      id: 'admin.channels.sendFrom.description',
      defaultMessage: 'The address your email comes from.',
    })

  return (
    <SettingsCard id={id} title={cardTitle} description={cardDescription} action={action}>
      <SettingRows>
        {showDefault && (
          <SettingRow
            stackOnPhone
            label={intl.formatMessage({
              id: 'admin.channels.sendFrom.default',
              defaultMessage: 'Default',
            })}
            htmlFor="send-from-default"
            description={notLiveHint('default') ?? defaultHint}
            control={
              <Select
                value={valueOf(defaultChoice, 'default')}
                disabled={setSender.isPending}
                onValueChange={(v) => choose('default', String(v))}
              >
                <SelectTrigger
                  id="send-from-default"
                  className={TRIGGER}
                  aria-label={intl.formatMessage({
                    id: 'admin.channels.sendFrom.default',
                    defaultMessage: 'Default',
                  })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor('default').map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={PLATFORM}>
                    {intl.formatMessage(
                      {
                        id: 'admin.channels.sendFrom.platformOption',
                        defaultMessage: '{platform} ({address})',
                      },
                      {
                        platform: platformName,
                        address:
                          platformFrom ??
                          intl.formatMessage({
                            id: 'admin.channels.sendFrom.notSet',
                            defaultMessage: 'not set',
                          }),
                      }
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        )}
        {showDefault && listed.length > 0 && (
          <div className="py-3.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.channels.sendFrom.except',
                defaultMessage: 'Except',
              })}
            </h3>
            <SettingRows className="mt-3">{listed.map(row)}</SettingRows>
          </div>
        )}
        {!showDefault && listed.map(row)}
        {addable.length > 0 && (
          <div className="py-3.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                {intl.formatMessage({
                  id: 'admin.channels.sendFrom.useDifferent',
                  defaultMessage: 'Use a different address for',
                })}
                <ChevronDownIcon className="size-3.5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {addable.map(({ surface }) => (
                  <DropdownMenuItem
                    key={surface}
                    onClick={() => setPicked((current) => [...current, surface])}
                  >
                    {intl.formatMessage(SURFACE_LABEL[surface])}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </SettingRows>
    </SettingsCard>
  )
}
