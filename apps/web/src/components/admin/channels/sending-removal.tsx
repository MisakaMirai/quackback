/**
 * Removing a sending address or a sending domain: what the confirmation says
 * and what it does, in one place for every page that offers it (Settings →
 * Email and a domain's own page).
 */
import type { IntlShape } from 'react-intl'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  useDeleteChannelAccount,
  useDeleteSendingDomain,
} from '@/lib/client/mutations/channel-accounts'
import type { EmailSendersDTO, SendingDomainDTO } from '@/lib/server/functions/channel-accounts'
import { SENDER_SURFACES, SURFACE_LABEL } from './send-from-card'

export type SendingAddress = {
  id: string
  address: string | null
  senderName?: string | null
  config: Record<string, unknown>
  sendingDomainId?: string | null
  sendingDomain: { domain: string; status: string } | null
  createdAt?: string
  /** Whether email can leave from it right now (the send guard's answer). */
  sendable: boolean
}

/**
 * The domain row an address sends through: the one it is linked to, else the
 * one whose zone it is in (addresses added before linking carry no id).
 */
export function domainOf(
  a: Pick<SendingAddress, 'address' | 'sendingDomainId'>,
  domains: SendingDomainDTO[]
): SendingDomainDTO | null {
  if (a.sendingDomainId) {
    const linked = domains.find((d) => d.id === a.sendingDomainId)
    if (linked) return linked
  }
  const at = a.address?.split('@')[1]?.toLowerCase()
  if (!at) return null
  return domains.find((d) => at === d.domain || at.endsWith(`.${d.domain}`)) ?? null
}

/**
 * What removing an address does to the email that sends from it, in one
 * sentence: the kinds that override to it fall back to the default, and when
 * it is the default, everything it sends falls to the platform address.
 * Support counts as using the address behind its inbox.
 */
export function removalNote(
  intl: IntlShape,
  id: string,
  senders: EmailSendersDTO,
  platformFrom: string | null,
  platformName: string
): string | null {
  if (senders.default?.mode === 'address' && senders.default.id === id) {
    return platformFrom
      ? intl.formatMessage(
          {
            id: 'admin.channels.email.remove.noteDefaultFrom',
            defaultMessage: "It's your default address, so email will come from {address} instead.",
          },
          { address: platformFrom }
        )
      : intl.formatMessage(
          {
            id: 'admin.channels.email.remove.noteDefaultName',
            defaultMessage:
              "It's your default address, so email will come from the {name} instead.",
          },
          { name: platformName.toLowerCase() }
        )
  }
  const using = SENDER_SURFACES.filter((s) => {
    const choice = senders[s]
    return (
      (choice?.mode === 'address' && choice.id === id) ||
      (choice?.mode === 'inbox' && choice.fallbackId === id)
    )
  })
  if (using.length === 0) return null
  const surfaces = intl.formatList(
    using.map((s) => intl.formatMessage(SURFACE_LABEL[s])),
    { type: 'conjunction' }
  )
  return intl.formatMessage(
    {
      id: 'admin.channels.email.remove.noteSurfaces',
      defaultMessage: '{surfaces} email will come from your default address instead.',
    },
    { surfaces }
  )
}

export interface AddressRemoval {
  id: string
  address: string
  /** The domain that goes with it, when this is the last address on it. */
  alsoDomain: string | null
  note: string | null
}

export interface DomainRemoval {
  id: string
  domain: string
}

interface RemovalDialogProps<T> {
  /** What is being removed; null keeps the dialog closed. */
  target: T | null
  onClose: () => void
  /** Called as the removal starts, to clear an earlier error. */
  onStart?: () => void
  /** Makes the handler for a failure, given the line to fall back to. */
  onError: (fallback: string) => (error: unknown) => void
  /** Called once everything the dialog removes has been tried. */
  onRemoved?: () => void
}

/** Confirms and removes one sending address, and its domain when it was the last on it. */
export function RemoveAddressDialog({
  target,
  onClose,
  onStart,
  onError,
  onRemoved,
}: RemovalDialogProps<AddressRemoval>) {
  const intl = useOptionalIntl()
  const del = useDeleteChannelAccount()
  const removeDomain = useDeleteSendingDomain()
  const domainFailed = intl.formatMessage({
    id: 'admin.channels.email.remove.domainFailed',
    defaultMessage: "Couldn't remove the domain.",
  })
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        target?.address
          ? intl.formatMessage(
              {
                id: 'admin.channels.email.remove.title',
                defaultMessage: 'Remove {address}?',
              },
              { address: target.address }
            )
          : intl.formatMessage({
              id: 'admin.channels.email.remove.titleNoAddress',
              defaultMessage: 'Remove address?',
            })
      }
      description={[
        target?.note ??
          intl.formatMessage({
            id: 'admin.channels.email.remove.description',
            defaultMessage: 'Email can no longer be sent from this address.',
          }),
        target?.alsoDomain
          ? intl.formatMessage(
              {
                id: 'admin.channels.email.remove.alsoDomain',
                defaultMessage: '{domain} stops sending email too.',
              },
              { domain: target.alsoDomain }
            )
          : null,
      ]
        .filter(Boolean)
        .join(' ')}
      confirmLabel={intl.formatMessage({
        id: 'admin.channels.email.remove.confirm',
        defaultMessage: 'Remove address',
      })}
      variant="destructive"
      isPending={del.isPending}
      onConfirm={() => {
        if (target) {
          const { id, alsoDomain } = target
          onStart?.()
          del.mutate(id, {
            // Only the domain the dialog named, and only when the server
            // agrees no address uses it any more.
            onSuccess: ({ lastOnDomain }) => {
              if (alsoDomain && lastOnDomain?.domain === alsoDomain) {
                removeDomain.mutate(lastOnDomain.id, {
                  onError: onError(domainFailed),
                  onSettled: onRemoved,
                })
              } else {
                onRemoved?.()
              }
            },
            onError: onError(
              intl.formatMessage({
                id: 'admin.channels.email.remove.addressFailed',
                defaultMessage: "Couldn't remove the address.",
              })
            ),
          })
        }
        onClose()
      }}
    />
  )
}

/**
 * Confirms and removes a sending domain no address uses. Worded as what
 * stops, since the domain may have other uses this does not touch.
 */
export function RemoveDomainDialog({
  target,
  onClose,
  onStart,
  onError,
  onRemoved,
}: RemovalDialogProps<DomainRemoval>) {
  const intl = useOptionalIntl()
  const removeDomain = useDeleteSendingDomain()
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        target
          ? intl.formatMessage(
              {
                id: 'admin.channels.email.remove.domainTitle',
                defaultMessage: 'Stop sending email from {domain}?',
              },
              { domain: target.domain }
            )
          : intl.formatMessage({
              id: 'admin.channels.email.remove.domainTitleNoDomain',
              defaultMessage: 'Stop sending email?',
            })
      }
      description={intl.formatMessage({
        id: 'admin.channels.email.remove.domainDescription',
        defaultMessage: 'Its email DNS records can be deleted afterwards.',
      })}
      confirmLabel={intl.formatMessage({
        id: 'admin.channels.email.remove.domainConfirm',
        defaultMessage: 'Stop sending email',
      })}
      variant="destructive"
      isPending={removeDomain.isPending}
      onConfirm={() => {
        if (target) {
          onStart?.()
          removeDomain.mutate(target.id, {
            onError: onError(
              intl.formatMessage({
                id: 'admin.channels.email.remove.domainFailed',
                defaultMessage: "Couldn't remove the domain.",
              })
            ),
            onSuccess: onRemoved,
          })
        }
        onClose()
      }}
    />
  )
}
