import { useState } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { settingsQueries } from '@/lib/client/queries/settings'
import { channelSettingsQueries } from '@/lib/client/queries/channel-settings'
import { useUpdateSpamFilterConfig } from '@/lib/client/mutations/settings'
import { useUpdateEmailAutoAck } from '@/lib/client/mutations/channel-settings'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { moduleCrumb } from '@/components/admin/settings/settings-nav-sections'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { LocalDate, NUMERIC_DATE_TIME } from '@/components/ui/local-date'
import { TrustedSendersCard } from '@/components/admin/settings/trusted-senders-card'
import { SupportInboxSettings } from '@/components/admin/channels/email-channel-settings'
import { useHasPermission } from '@/lib/client/hooks/use-root-context'
import { EMAIL_SENDING_PERMISSION } from '@/lib/shared/email-sending-permissions'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

/** Rows of email activity shown before "View all activity". */
const ACTIVITY_PREVIEW_ROWS = 5

export function EmailChannelPage() {
  const intl = useOptionalIntl()
  const canManageSending = useHasPermission(EMAIL_SENDING_PERMISSION)
  return (
    <SettingsPage
      page="/admin/settings/channels/email"
      description={intl.formatMessage({
        id: 'admin.settings.emailChannel.pageDescription',
        defaultMessage:
          'Turn email to your support address into conversations, and choose where replies come from.',
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
      <SupportInboxSettings canManageSending={canManageSending} />
      <TrustedSendersSection />
      <AutoAckCard />
      <EmailActivityCard />
    </SettingsPage>
  )
}

function AutoAckCard() {
  const intl = useOptionalIntl()
  const query = useQuery(channelSettingsQueries.emailAutoAck())
  const update = useUpdateEmailAutoAck()
  const enabled = update.isPending ? update.variables : (query.data?.enabled ?? false)
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.emailChannel.autoAckTitle',
        defaultMessage: 'Auto-acknowledgement',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.emailChannel.autoAckDescription',
        defaultMessage: 'Send a short confirmation when a new inbound email opens a conversation.',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.emailChannel.autoAckLabel',
            defaultMessage: 'Acknowledge new inbound mail',
          })}
          description={intl.formatMessage({
            id: 'admin.settings.emailChannel.autoAckRowDescription',
            defaultMessage:
              'Never sent in reply to automated mail, mailing lists, or our own addresses.',
          })}
          htmlFor="email-auto-ack"
          control={
            <Switch
              id="email-auto-ack"
              checked={enabled}
              disabled={query.isLoading}
              onCheckedChange={(checked) => update.mutate(checked)}
            />
          }
        />
      </SettingRows>
    </SettingsCard>
  )
}

function EmailActivityCard() {
  const intl = useOptionalIntl()
  const query = useQuery(channelSettingsQueries.emailActivity())
  const [showAll, setShowAll] = useState(false)
  const all = query.data ?? []
  const rows = showAll ? all : all.slice(0, ACTIVITY_PREVIEW_ROWS)
  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.emailChannel.activityTitle',
        defaultMessage: 'Email activity',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.emailChannel.activityDescription',
        defaultMessage: 'Recent sent and received mail on this workspace.',
      })}
      action={
        all.length > ACTIVITY_PREVIEW_ROWS ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? intl.formatMessage({
                  id: 'admin.settings.emailChannel.showLess',
                  defaultMessage: 'Show less',
                })
              : intl.formatMessage({
                  id: 'admin.settings.emailChannel.viewAllActivity',
                  defaultMessage: 'View all activity',
                })}
          </Button>
        ) : undefined
      }
      flush={all.length > 0}
    >
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.settings.emailChannel.activityEmpty',
            defaultMessage: 'No email recorded yet.',
          })}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-[13px] text-muted-foreground">
              <th className="px-4 py-2 font-normal sm:px-6">
                {intl.formatMessage({
                  id: 'admin.settings.emailChannel.columnMessage',
                  defaultMessage: 'Message',
                })}
              </th>
              <th className="py-2 font-normal">
                {intl.formatMessage({
                  id: 'admin.settings.emailChannel.columnStatus',
                  defaultMessage: 'Status',
                })}
              </th>
              <th className="px-4 py-2 text-right font-normal sm:px-6">
                {intl.formatMessage({
                  id: 'admin.settings.emailChannel.columnTime',
                  defaultMessage: 'Time',
                })}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5 sm:px-6">
                  <span className="capitalize">{row.direction}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{row.emailType}</span>
                </td>
                <td className="py-2.5">{row.status}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground sm:px-6">
                  <LocalDate date={row.createdAt} options={NUMERIC_DATE_TIME} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SettingsCard>
  )
}

function TrustedSendersSection() {
  const spamFilterQuery = useSuspenseQuery(settingsQueries.spamFilterConfig())
  const updateSpamFilterConfig = useUpdateSpamFilterConfig()
  return (
    <TrustedSendersCard
      entries={spamFilterQuery.data.trustedSenders}
      onSave={async (trustedSenders) => {
        await updateSpamFilterConfig.mutateAsync({ trustedSenders })
      }}
    />
  )
}
