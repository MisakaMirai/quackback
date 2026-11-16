import { SettingsCard } from '@/components/admin/settings/settings-card'
import { VisibilityTiles } from '@/components/admin/settings/visibility-tiles'
import { SegmentMultiSelect } from '@/components/admin/segments/segment-multi-select'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useSegments } from '@/lib/client/hooks/use-segments-queries'
import type { StatusAudience, StatusSettings } from '@/lib/shared/status-settings'

interface StatusVisibilityCardProps {
  settings: StatusSettings
  onChange: (patch: Partial<StatusSettings>) => void
  disabled?: boolean
}

interface AudienceOption {
  value: StatusAudience
  title: { id: string; defaultMessage: string }
  description: { id: string; defaultMessage: string }
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    value: 'public',
    title: {
      id: 'admin.settings.status.visibility.everyone.title',
      defaultMessage: 'Everyone',
    },
    description: {
      id: 'admin.settings.status.visibility.everyone.description',
      defaultMessage: 'Anyone who can reach your portal, with an RSS feed',
    },
  },
  {
    value: 'authenticated',
    title: {
      id: 'admin.settings.status.visibility.signedIn.title',
      defaultMessage: 'Signed-in users',
    },
    description: {
      id: 'admin.settings.status.visibility.signedIn.description',
      defaultMessage: 'Only users signed in to your portal',
    },
  },
  {
    value: 'segments',
    title: {
      id: 'admin.settings.status.visibility.segments.title',
      defaultMessage: 'Specific segments',
    },
    description: {
      id: 'admin.settings.status.visibility.segments.description',
      defaultMessage: 'Only signed-in users in the segments you choose',
    },
  },
]

export function StatusVisibilityCard({ settings, onChange, disabled }: StatusVisibilityCardProps) {
  const intl = useOptionalIntl()
  const segmentsQuery = useSegments()

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.status.visibility.title',
        defaultMessage: 'Visibility',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.status.visibility.description',
        defaultMessage: 'Who can view the status page.',
      })}
    >
      <div className="space-y-3">
        <VisibilityTiles
          name="status-audience"
          value={settings.audience}
          onChange={(audience) => onChange({ audience })}
          options={AUDIENCE_OPTIONS.map((option) => ({
            value: option.value,
            title: intl.formatMessage(option.title),
            description: intl.formatMessage(option.description),
          }))}
          disabled={disabled}
        />
        {settings.audience === 'segments' &&
          (segmentsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.security.portalAccess.segments.loading',
                defaultMessage: 'Loading segments…',
              })}
            </p>
          ) : (
            <SegmentMultiSelect
              segments={segmentsQuery.data ?? []}
              value={settings.allowedSegmentIds}
              onChange={(next) => onChange({ allowedSegmentIds: next })}
              disabled={disabled}
              ariaLabel={intl.formatMessage({
                id: 'admin.settings.status.visibility.allowedSegmentsAria',
                defaultMessage: 'Status page allowed segments',
              })}
            />
          ))}
      </div>
    </SettingsCard>
  )
}
