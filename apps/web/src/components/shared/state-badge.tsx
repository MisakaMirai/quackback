import { Badge } from '@/components/ui/badge'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

export type BadgeState =
  'on' | 'off' | 'paused' | 'connected' | 'setting-up' | 'pending' | 'attention' | 'error'

const STATES: Record<
  BadgeState,
  {
    labelId: string
    defaultLabel: string
    variant: 'secondary' | 'success' | 'warning' | 'destructive'
  }
> = {
  on: { labelId: 'common.state.on', defaultLabel: 'On', variant: 'secondary' },
  off: { labelId: 'common.state.off', defaultLabel: 'Off', variant: 'secondary' },
  paused: { labelId: 'common.state.paused', defaultLabel: 'Paused', variant: 'secondary' },
  connected: {
    labelId: 'common.state.connected',
    defaultLabel: 'Connected',
    variant: 'success',
  },
  'setting-up': {
    labelId: 'common.state.settingUp',
    defaultLabel: 'Setting up',
    variant: 'secondary',
  },
  pending: { labelId: 'common.state.pending', defaultLabel: 'Pending', variant: 'secondary' },
  attention: {
    labelId: 'common.state.needsAttention',
    defaultLabel: 'Needs attention',
    variant: 'warning',
  },
  error: { labelId: 'common.state.error', defaultLabel: 'Error', variant: 'destructive' },
}

/**
 * The one state vocabulary. Render it only for a non-default state; a normal
 * state shows no badge.
 */
export function StateBadge({ state }: { state: BadgeState }) {
  const intl = useOptionalIntl()
  const { labelId, defaultLabel, variant } = STATES[state]
  return (
    <Badge variant={variant} size="sm">
      {intl.formatMessage({ id: labelId, defaultMessage: defaultLabel })}
    </Badge>
  )
}
