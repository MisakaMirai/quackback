/** SLA event declarations (WO-2). */
import { decl } from './helpers'

const S = 'conversation'
const wh = { webhook: true } as const

export const slaApproachingBreach = decl(
  'sla.approaching_breach',
  'conversation',
  { ...wh, notification: 'sla_warning' },
  S
)
export const slaBreached = decl(
  'sla.breached',
  'conversation',
  { ...wh, notification: 'sla_breach' },
  S
)
