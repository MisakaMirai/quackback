import { useQuery } from '@tanstack/react-query'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { channelSettingsQueries } from '@/lib/client/queries/channel-settings'

function TransportValue({ children }: { children: string }) {
  return <span className="text-sm">{children}</span>
}

const OUTBOUND_LABEL: Record<string, string> = {
  ses: 'Amazon SES',
  smtp: 'SMTP',
  resend: 'Resend',
}

/**
 * Read-only env probe: outbound provider, from-address, inbound domain. Shown
 * only where the server is the workspace's own: on one shared by many
 * workspaces these describe the platform, which is not theirs to set up.
 */
export function EmailTransportCard() {
  const intl = useOptionalIntl()
  const { data } = useQuery(channelSettingsQueries.emailStatus())

  if (!data?.ownServer) return null

  const outboundLabel =
    OUTBOUND_LABEL[data.provider] ??
    intl.formatMessage({
      id: 'admin.channels.email.transport.notConfigured',
      defaultMessage: 'Not configured',
    })

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.channels.email.transport.title',
        defaultMessage: 'Transport',
      })}
      description={intl.formatMessage({
        id: 'admin.channels.email.transport.description',
        defaultMessage: 'How this server sends and receives email.',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.channels.email.transport.outbound',
            defaultMessage: 'Outbound email',
          })}
          control={<TransportValue>{outboundLabel}</TransportValue>}
        />
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.channels.email.transport.fromAddress',
            defaultMessage: 'From address',
          })}
          control={
            <TransportValue>
              {data.fromAddress ??
                intl.formatMessage({
                  id: 'admin.channels.email.transport.notSet',
                  defaultMessage: 'Not set',
                })}
            </TransportValue>
          }
        />
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.channels.email.transport.inboundReplies',
            defaultMessage: 'Inbound replies',
          })}
          control={
            <TransportValue>
              {data.inboundConfigured
                ? (data.inboundDomain ??
                  intl.formatMessage({
                    id: 'admin.channels.email.transport.configured',
                    defaultMessage: 'Configured',
                  }))
                : intl.formatMessage({
                    id: 'admin.channels.email.transport.notConfigured',
                    defaultMessage: 'Not configured',
                  })}
            </TransportValue>
          }
        />
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.channels.email.transport.customDomains',
            defaultMessage: 'Custom sending domains',
          })}
          control={
            <TransportValue>
              {data.customDomains === 'available'
                ? intl.formatMessage({
                    id: 'admin.channels.email.transport.available',
                    defaultMessage: 'Available',
                  })
                : intl.formatMessage({
                    id: 'admin.channels.email.transport.notAvailable',
                    defaultMessage: 'Not available',
                  })}
            </TransportValue>
          }
        />
      </SettingRows>
    </SettingsCard>
  )
}
