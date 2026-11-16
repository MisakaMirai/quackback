/**
 * Visitor tracking entitlement: whether this workspace's operator limits
 * include visitor analytics. Enabled by default; an operator that turns it off
 * stores nothing, whatever a beacon sends.
 */
import { getTierLimits } from '@/lib/server/domains/settings/tier-limits.service'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'visitor-tracking' })

/**
 * Whether the workspace's limits include visitor analytics. Fails closed: if
 * the limits cannot be read, nothing is counted.
 */
export async function isVisitorAnalyticsEntitled(): Promise<boolean> {
  try {
    const limits = await getTierLimits()
    return limits.features.visitorAnalytics === true
  } catch (error) {
    log.error({ err: error }, 'tier limits unreadable, visitor analytics off for this request')
    return false
  }
}
