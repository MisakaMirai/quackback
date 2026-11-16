import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { normalizeTrustedSenderEntry, MAX_TRUSTED_SENDERS } from '@/lib/shared/trusted-senders'

interface TrustedSendersCardProps {
  entries: string[]
  /** Persist the full replacement list; resolves once the server accepted it. */
  onSave: (entries: string[]) => Promise<void>
}

/**
 * The spam filter's trusted-sender list: entries here bypass inbound spam
 * classification entirely. An entry is a full address (`jane@acme.com`) or a
 * whole domain (`acme.com`). The server re-validates on save; the client
 * validates first so a typo never makes the round trip.
 */
export function TrustedSendersCard({ entries, onSave }: TrustedSendersCardProps) {
  const intl = useOptionalIntl()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  async function save(next: string[]) {
    setSaving(true)
    try {
      await onSave(next)
      setDraft('')
      setError(null)
    } catch {
      setError(
        intl.formatMessage({
          id: 'admin.settings.trustedSenders.saveFailed',
          defaultMessage: 'Could not save the list. Try again.',
        })
      )
    } finally {
      setSaving(false)
    }
  }

  function addEntry() {
    const normalized = normalizeTrustedSenderEntry(draft)
    if (!normalized) {
      setError(
        intl.formatMessage({
          id: 'admin.settings.trustedSenders.invalid',
          defaultMessage: 'Enter a valid email address or domain (e.g. jane@acme.com or acme.com).',
        })
      )
      return
    }
    if (entries.includes(normalized)) {
      setError(
        intl.formatMessage({
          id: 'admin.settings.trustedSenders.alreadyOnList',
          defaultMessage: 'That sender is already on the list.',
        })
      )
      return
    }
    if (entries.length >= MAX_TRUSTED_SENDERS) {
      setError(
        intl.formatMessage(
          {
            id: 'admin.settings.trustedSenders.capped',
            defaultMessage: 'The list is capped at {count} entries.',
          },
          { count: MAX_TRUSTED_SENDERS }
        )
      )
      return
    }
    void save([...entries, normalized])
  }

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.trustedSenders.title',
        defaultMessage: 'Trusted senders',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.trustedSenders.description',
        defaultMessage:
          'Senders that always skip the spam filter. Add a full address or a whole domain.',
      })}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="trusted-sender-input" className="sr-only">
              {intl.formatMessage({
                id: 'admin.settings.trustedSenders.addLabel',
                defaultMessage: 'Add trusted sender',
              })}
            </Label>
            <Input
              id="trusted-sender-input"
              value={draft}
              placeholder={intl.formatMessage(
                {
                  id: 'admin.settings.trustedSenders.placeholder',
                  defaultMessage: '{address} or {domain}',
                },
                { address: 'jane@acme.com', domain: 'acme.com' }
              )}
              onChange={(e) => {
                setDraft(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEntry()
                }
              }}
              disabled={saving}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addEntry}
            disabled={!draft.trim() || saving}
            className="shrink-0"
          >
            {intl.formatMessage({ id: 'common.add', defaultMessage: 'Add' })}
          </Button>
        </div>

        {entries.length > 0 ? (
          <ul
            className="space-y-1.5"
            role="list"
            aria-label={intl.formatMessage({
              id: 'admin.settings.trustedSenders.title',
              defaultMessage: 'Trusted senders',
            })}
          >
            {entries.map((entry) => (
              <li
                key={entry}
                className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-1.5"
              >
                <span className="text-sm font-mono">{entry}</span>
                <button
                  type="button"
                  onClick={() => setRemoveTarget(entry)}
                  disabled={saving}
                  className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors"
                  aria-label={intl.formatMessage(
                    {
                      id: 'admin.settings.trustedSenders.removeAria',
                      defaultMessage: 'Remove {sender}',
                    },
                    { sender: entry }
                  )}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.trustedSenders.empty',
              defaultMessage: 'No trusted senders yet.',
            })}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={intl.formatMessage({
          id: 'admin.settings.trustedSenders.deleteTitle',
          defaultMessage: 'Delete sender?',
        })}
        description={
          removeTarget
            ? intl.formatMessage(
                {
                  id: 'admin.settings.trustedSenders.deleteDescription',
                  defaultMessage: '{sender} will go through spam classification again.',
                },
                { sender: removeTarget }
              )
            : undefined
        }
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.trustedSenders.deleteConfirm',
          defaultMessage: 'Delete sender',
        })}
        variant="destructive"
        isPending={saving}
        onConfirm={async () => {
          const target = removeTarget
          setRemoveTarget(null)
          if (target) await save(entries.filter((e) => e !== target))
        }}
      />
    </SettingsCard>
  )
}
