import { useState, useTransition } from 'react'
import { useRouter, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { settingsQueries } from '@/lib/client/queries/settings'
import { useUpdatePortalConfig, useUpdateMessengerConfig } from '@/lib/client/mutations/settings'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { moduleCrumb } from '@/components/admin/settings/settings-nav-sections'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/shared/utils'
import { SUPPORTED_LOCALES } from '@/lib/shared/i18n'
import {
  MESSENGER_LOCALE_LABELS,
  type MessengerTranslations,
} from '@/lib/shared/messenger/translations'
import { INLINE_LINK } from '@/components/admin/settings/inline-link'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

export function MessengerChannelPage() {
  const intl = useOptionalIntl()
  const router = useRouter()
  const updateMessengerConfig = useUpdateMessengerConfig()
  const updatePortalConfig = useUpdatePortalConfig()
  const messengerConfigQuery = useSuspenseQuery(settingsQueries.messengerConfig())
  const portalConfigQuery = useSuspenseQuery(settingsQueries.portalConfig())
  const config = messengerConfigQuery.data
  const messengerConfig = config.messenger
  const [isPending, startTransition] = useTransition()
  const [savingField, setSavingField] = useState<string | null>(null)
  const [portalSupportEnabled, setPortalSupportEnabled] = useState(
    portalConfigQuery.data?.support?.enabled ?? true
  )
  // The stored flag is the opposite of the switch: reopening is allowed unless replies are prevented.
  const [reopenOnReply, setReopenOnReply] = useState(
    !(messengerConfig?.preventRepliesWhenClosed ?? false)
  )
  const [welcomeMessage, setWelcomeMessage] = useState(messengerConfig?.welcomeMessage ?? '')
  const [offlineMessage, setOfflineMessage] = useState(messengerConfig?.offlineMessage ?? '')
  const [teamName, setTeamName] = useState(messengerConfig?.teamName ?? '')
  const [translations, setTranslations] = useState<MessengerTranslations>(config.translations ?? {})
  const [translationLocale, setTranslationLocale] = useState<string>('en')

  async function persist(
    field: string,
    data: Parameters<typeof updateMessengerConfig.mutateAsync>[0],
    revert?: () => void
  ) {
    setSavingField(field)
    try {
      await updateMessengerConfig.mutateAsync(data)
      startTransition(() => router.invalidate())
    } catch {
      revert?.()
    } finally {
      setSavingField(null)
    }
  }

  const isBusy = savingField !== null || isPending

  return (
    <SettingsPage
      page="/admin/settings/channels/messenger"
      description={intl.formatMessage({
        id: 'admin.settings.messenger.pageDescription',
        defaultMessage: 'Live chat on the portal.',
      })}
      crumbs={[
        moduleCrumb('/admin/settings/support'),
        {
          label: intl.formatMessage({
            id: 'admin.settings.channels.crumb',
            defaultMessage: 'Channels',
          }),
          to: '/admin/settings/channels',
        },
      ]}
    >
      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.messenger.surfacesTitle',
          defaultMessage: 'Surfaces',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.messenger.surfacesDescription',
          defaultMessage: 'Where customers can start conversations.',
        })}
      >
        <SettingRows>
          <SettingRow
            label={intl.formatMessage({
              id: 'admin.settings.messenger.portalChats',
              defaultMessage: 'Portal chats',
            })}
            description={intl.formatMessage({
              id: 'admin.settings.messenger.portalChatsDescription',
              defaultMessage:
                "Let signed-in customers start new conversations from the portal's Support tab.",
            })}
            htmlFor="portal-support-enabled"
            control={
              <Switch
                id="portal-support-enabled"
                checked={portalSupportEnabled}
                onCheckedChange={async (checked) => {
                  setPortalSupportEnabled(checked)
                  setSavingField('portalSupport')
                  try {
                    await updatePortalConfig.mutateAsync({ support: { enabled: checked } })
                    startTransition(() => router.invalidate())
                  } catch {
                    setPortalSupportEnabled(!checked)
                  } finally {
                    setSavingField(null)
                  }
                }}
                disabled={isBusy}
              />
            }
          />
        </SettingRows>
      </SettingsCard>

      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.messenger.messagingTitle',
          defaultMessage: 'Messaging',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.messenger.messagingDescription',
          defaultMessage: 'Greeting and team name shown to visitors.',
        })}
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="messenger-team-name">
              {intl.formatMessage({
                id: 'admin.settings.messenger.teamName',
                defaultMessage: 'Team name',
              })}
            </Label>
            <Input
              id="messenger-team-name"
              value={teamName}
              maxLength={80}
              placeholder={intl.formatMessage({
                id: 'admin.settings.teams.dialog.namePlaceholder',
                defaultMessage: 'Support',
              })}
              onChange={(e) => setTeamName(e.target.value)}
              onBlur={() => persist('teamName', { messenger: { teamName: teamName.trim() } })}
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.messenger.teamNameHint',
                defaultMessage: 'Shown in the messenger header. Falls back to the workspace name.',
              })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="messenger-welcome">
              {intl.formatMessage({
                id: 'admin.settings.messenger.welcomeMessage',
                defaultMessage: 'Welcome message',
              })}
            </Label>
            <Textarea
              id="messenger-welcome"
              value={welcomeMessage}
              maxLength={500}
              rows={2}
              placeholder={intl.formatMessage({
                id: 'admin.settings.messenger.welcomePlaceholder',
                defaultMessage: 'Hi! How can we help you today?',
              })}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              onBlur={() =>
                persist('welcomeMessage', { messenger: { welcomeMessage: welcomeMessage.trim() } })
              }
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(
                {
                  id: 'admin.settings.messenger.welcomeHint',
                  defaultMessage:
                    'Greets a customer opening a new conversation. <code>{token}</code> inserts their name.',
                },
                {
                  token: '{{first_name}}',
                  code: (chunks) => (
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{chunks}</code>
                  ),
                }
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="messenger-offline">
              {intl.formatMessage({
                id: 'admin.settings.messenger.offlineMessage',
                defaultMessage: 'Offline message',
              })}
            </Label>
            <Textarea
              id="messenger-offline"
              value={offlineMessage}
              maxLength={500}
              rows={2}
              placeholder={intl.formatMessage({
                id: 'admin.settings.messenger.offlinePlaceholder',
                defaultMessage:
                  "We're away right now. Leave a message and we'll get back to you by email.",
              })}
              onChange={(e) => setOfflineMessage(e.target.value)}
              onBlur={() =>
                persist('offlineMessage', { messenger: { offlineMessage: offlineMessage.trim() } })
              }
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(
                {
                  id: 'admin.settings.messenger.offlineHint',
                  defaultMessage:
                    'Shown outside <link>office hours</link> or when nobody is online.',
                },
                {
                  link: (chunks) => (
                    <Link to="/admin/settings/office-hours" className={INLINE_LINK}>
                      {chunks}
                    </Link>
                  ),
                }
              )}
            </p>
          </div>
          <MessengerTranslations
            translations={translations}
            selectedLocale={translationLocale}
            onSelectLocale={setTranslationLocale}
            disabled={isBusy}
            onCommit={(next) => {
              const prev = translations
              setTranslations(next)
              persist('translations', { translations: next }, () => setTranslations(prev))
            }}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.settings.messenger.closedConversations',
          defaultMessage: 'Closed conversations',
        })}
      >
        <SettingRows>
          <SettingRow
            label={intl.formatMessage({
              id: 'admin.settings.messenger.reopenOnReply',
              defaultMessage: 'Reopen when a visitor replies',
            })}
            description={intl.formatMessage({
              id: 'admin.settings.messenger.reopenOnReplyDescription',
              defaultMessage: 'Off starts a new conversation instead. Email replies always reopen.',
            })}
            htmlFor="reopen-on-reply"
            control={
              <Switch
                id="reopen-on-reply"
                checked={reopenOnReply}
                onCheckedChange={(checked) => {
                  setReopenOnReply(checked)
                  persist(
                    'reopenOnReply',
                    { messenger: { preventRepliesWhenClosed: !checked } },
                    () => setReopenOnReply(!checked)
                  )
                }}
                disabled={isBusy}
              />
            }
          />
        </SettingRows>
      </SettingsCard>
    </SettingsPage>
  )
}

function MessengerTranslations({
  translations,
  selectedLocale,
  onSelectLocale,
  disabled,
  onCommit,
}: {
  translations: MessengerTranslations
  selectedLocale: string
  onSelectLocale: (locale: string) => void
  disabled: boolean
  onCommit: (next: MessengerTranslations) => void
}) {
  const intl = useOptionalIntl()
  const isDefault = selectedLocale === 'en'
  const entry = translations[selectedLocale] ?? {}

  function commitField(key: 'welcomeMessage' | 'offlineMessage', raw: string) {
    const value = raw.trim()
    if (value === (entry[key] ?? '')) return
    const nextEntry = { ...entry, [key]: value || undefined }
    const next = { ...translations, [selectedLocale]: nextEntry }
    if (!nextEntry.welcomeMessage && !nextEntry.offlineMessage) {
      const { [selectedLocale]: _removed, ...rest } = next
      onCommit(rest)
      return
    }
    onCommit(next)
  }

  return (
    <div className="border-t border-border/40 pt-4 space-y-3">
      <span className="text-sm font-medium">
        {intl.formatMessage({
          id: 'admin.settings.messenger.translations',
          defaultMessage: 'Translations',
        })}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => onSelectLocale(locale)}
            disabled={disabled}
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
              selectedLocale === locale
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {MESSENGER_LOCALE_LABELS[locale] ?? locale}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {intl.formatMessage({
          id: 'admin.settings.messenger.translationsHint',
          defaultMessage: 'Welcome and offline messages per locale.',
        })}
      </p>
      {!isDefault && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="messenger-welcome-locale">
              {intl.formatMessage({
                id: 'admin.settings.messenger.welcomeMessage',
                defaultMessage: 'Welcome message',
              })}
            </Label>
            <Textarea
              id="messenger-welcome-locale"
              defaultValue={entry.welcomeMessage ?? ''}
              key={`${selectedLocale}-welcome`}
              maxLength={500}
              rows={2}
              placeholder={intl.formatMessage({
                id: 'admin.settings.messenger.welcomePlaceholder',
                defaultMessage: 'Hi! How can we help you today?',
              })}
              disabled={disabled}
              onBlur={(e) => commitField('welcomeMessage', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="messenger-offline-locale">
              {intl.formatMessage({
                id: 'admin.settings.messenger.offlineMessage',
                defaultMessage: 'Offline message',
              })}
            </Label>
            <Textarea
              id="messenger-offline-locale"
              defaultValue={entry.offlineMessage ?? ''}
              key={`${selectedLocale}-offline`}
              maxLength={500}
              rows={2}
              placeholder={intl.formatMessage({
                id: 'admin.settings.messenger.offlinePlaceholder',
                defaultMessage:
                  "We're away right now. Leave a message and we'll get back to you by email.",
              })}
              disabled={disabled}
              onBlur={(e) => commitField('offlineMessage', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
