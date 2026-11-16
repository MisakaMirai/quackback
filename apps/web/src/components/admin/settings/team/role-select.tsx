import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { settingsQueries } from '@/lib/client/queries/settings'
import { SYSTEM_ROLES } from '@/lib/shared/permissions'
import type { RoleChoice } from '@/components/admin/settings/team/add-people'

/** System roles whose holders sit on the admin tier. */
const ADMIN_TIER_KEYS: ReadonlySet<string> = new Set([SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN])

/**
 * The role picked in a team role select: 'member', 'admin', or a role's id.
 * Resolves it to what the server takes plus its display name. `held` is the
 * role the person holds now, which the list may not otherwise carry.
 */
export function useRoleChoice(value: string, held?: RoleChoice): RoleChoice {
  const intl = useIntl()
  const { data } = useQuery(settingsQueries.roles())
  if (held && value === roleValueOf(held)) return held
  if (value === 'admin')
    return {
      role: 'admin',
      label: intl.formatMessage({
        id: 'onboarding.live.invite.admin',
        defaultMessage: 'Admin',
      }),
    }
  if (value === 'member')
    return {
      role: 'member',
      label: intl.formatMessage({
        id: 'onboarding.live.invite.member',
        defaultMessage: 'Member',
      }),
    }
  const found = (data?.roles ?? []).find((r) => r.id === value)
  const tier = found?.isSystem && ADMIN_TIER_KEYS.has(found.key) ? 'admin' : 'member'
  return {
    role: tier,
    roleId: value,
    label:
      found?.name ??
      intl.formatMessage({
        id: 'onboarding.live.invite.member',
        defaultMessage: 'Member',
      }),
  }
}

/** The select's value for a role the person holds. */
export function roleValueOf(role: { role: 'admin' | 'member'; roleId?: string | null }): string {
  return role.roleId ?? role.role
}

/**
 * Presets (Member, Admin, and Support lead when the workspace has it) then any
 * custom roles. Admin-tier roles are offered only to someone who can grant
 * them; the server refuses them otherwise anyway. A role the person already
 * holds that is neither (another system role, such as Contributor) is listed
 * in its group so the select opens on it.
 */
export function RoleSelect({
  id,
  value,
  onValueChange,
  canGrantAdmin,
  invalid,
  held,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  canGrantAdmin: boolean
  invalid?: boolean
  held?: RoleChoice
}) {
  const intl = useIntl()
  const { data } = useQuery(settingsQueries.roles())
  const customRoles = (data?.roles ?? []).filter((r) => !r.isSystem)
  const supportLead = (data?.roles ?? []).find(
    (r) => r.isSystem && r.key === SYSTEM_ROLES.SUPPORT_LEAD
  )
  const heldId = held?.roleId
  const heldExtra =
    heldId && heldId !== supportLead?.id && !customRoles.some((r) => r.id === heldId) ? (
      <SelectItem value={heldId} disabled={held.role === 'admin' && !canGrantAdmin}>
        {data?.roles.find((r) => r.id === heldId)?.name ?? held.label}
      </SelectItem>
    ) : null
  return (
    <Select value={value} onValueChange={(v: string) => onValueChange(v)}>
      <SelectTrigger
        id={id}
        className="w-full focus:border-muted-foreground sm:w-[330px]"
        aria-invalid={invalid || undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>
            {intl.formatMessage({
              id: 'admin.settings.security.idp.roles.presets',
              defaultMessage: 'Presets',
            })}
          </SelectLabel>
          <SelectItem value="member">
            {intl.formatMessage({
              id: 'admin.settings.team.roleSelect.member',
              defaultMessage: 'Member - Can view and create feedback',
            })}
          </SelectItem>
          <SelectItem value="admin" disabled={!canGrantAdmin}>
            {intl.formatMessage({
              id: 'admin.settings.team.roleSelect.admin',
              defaultMessage: 'Admin - Can manage settings and members',
            })}
          </SelectItem>
          {supportLead && (
            <SelectItem value={supportLead.id}>
              {intl.formatMessage({
                id: 'team.roleSelect.supportLead',
                defaultMessage:
                  'Support lead - Can also set up routing, workflows, SLAs and channels',
              })}
            </SelectItem>
          )}
          {heldExtra}
        </SelectGroup>
        {customRoles.length > 0 && (
          <SelectGroup>
            <SelectLabel>
              {intl.formatMessage({
                id: 'admin.settings.security.idp.table.custom',
                defaultMessage: 'Custom',
              })}
            </SelectLabel>
            {customRoles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

/** The one-line consequence under the select, and a refused grant from the server. */
export function RoleNotes({ role, refused }: { role: RoleChoice; refused: boolean }) {
  const intl = useIntl()
  if (refused) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {intl.formatMessage({
          id: 'admin.settings.team.roleSelect.ceilingRefused',
          defaultMessage:
            'You can only give a role with no more access than your own. Choose another role.',
        })}
      </p>
    )
  }
  if (role.role === 'admin') {
    return (
      <p className="text-xs text-warning">
        {intl.formatMessage({
          id: 'admin.settings.team.roleSelect.adminNote',
          defaultMessage: 'Admins can change settings, members and sign-in.',
        })}
      </p>
    )
  }
  return null
}
