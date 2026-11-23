'use client'

import { useState, type ReactNode } from 'react'
import { FormattedMessage } from 'react-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CheckIcon,
  EllipsisHorizontalIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  UserIcon,
  UserMinusIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  updateMemberRoleFn,
  removeTeamMemberFn,
  forceSignOutUserFn,
} from '@/lib/server/functions/admin'
import { adminResetTwoFactorFn } from '@/lib/server/functions/admin-reset-two-factor'
import { settingsQueries } from '@/lib/client/queries/settings'
import { toastError } from '@/lib/client/error-notice'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

interface MemberActionsProps {
  principalId: string
  userId: string | null
  memberName: string
  memberRole: 'admin' | 'member'
  /** Resolved workspace assignment, when it differs from the legacy mapping. */
  assignedRoleId?: string | null
  isLastAdmin: boolean
}

/** The role choice staged in the confirm dialog. */
interface RoleChoice {
  role: 'admin' | 'member'
  roleId?: string
  label: string
}

export function MemberActions({
  principalId,
  userId,
  memberName,
  memberRole,
  assignedRoleId,
  isLastAdmin,
}: MemberActionsProps) {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [pendingRole, setPendingRole] = useState<RoleChoice | null>(null)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [resetTfaDialogOpen, setResetTfaDialogOpen] = useState(false)
  const [forceSignOutDialogOpen, setForceSignOutDialogOpen] = useState(false)

  // Custom roles for the role section. Cached alongside the roles tab query.
  const { data: rolesData } = useQuery(settingsQueries.roles())
  const customRoles = (rolesData?.roles ?? []).filter((r) => !r.isSystem)

  const canChangeRole = !(memberRole === 'admin' && isLastAdmin)
  const canRemove = !(memberRole === 'admin' && isLastAdmin)

  const handleRoleChange = async () => {
    if (!pendingRole) return
    setIsLoading(true)
    try {
      await updateMemberRoleFn({
        data: { principalId, role: pendingRole.role, roleId: pendingRole.roleId },
      })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.memberActions.roleUpdateFailed',
          defaultMessage: "Couldn't update role. Try again.",
        })
      )
    } finally {
      setIsLoading(false)
      setPendingRole(null)
    }
  }

  const handleRemove = async () => {
    setIsLoading(true)
    try {
      await removeTeamMemberFn({ data: { principalId } })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.memberActions.removeFailed',
          defaultMessage: "Couldn't remove teammate. Try again.",
        })
      )
    } finally {
      setIsLoading(false)
      setRemoveDialogOpen(false)
    }
  }

  const handleResetTfa = async () => {
    if (!userId) return
    setIsLoading(true)
    try {
      await adminResetTwoFactorFn({ data: { userId } })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.memberActions.resetTfaFailed',
          defaultMessage: "Couldn't reset two-factor authentication.",
        })
      )
    } finally {
      setIsLoading(false)
      setResetTfaDialogOpen(false)
    }
  }

  const handleForceSignOut = async () => {
    if (!userId) return
    setIsLoading(true)
    try {
      const result = await forceSignOutUserFn({ data: { userId } })
      toast.success(
        result.revokeCount
          ? intl.formatMessage(
              {
                id: 'admin.settings.team.memberActions.forceSignOutSuccess',
                defaultMessage:
                  'Signed {name} out of {count, plural, one {# session} other {# sessions}}.',
              },
              { name: memberName, count: result.revokeCount }
            )
          : intl.formatMessage(
              {
                id: 'admin.settings.team.memberActions.noSessions',
                defaultMessage: '{name} had no active sessions.',
              },
              { name: memberName }
            )
      )
      await queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.settings.team.memberActions.signOutFailed',
          defaultMessage: 'Failed to sign user out',
        })
      )
    } finally {
      setIsLoading(false)
      setForceSignOutDialogOpen(false)
    }
  }

  const holdsCustom = customRoles.some((r) => r.id === assignedRoleId)
  const isCurrent = (choice: { role: 'admin' | 'member'; roleId?: string }) =>
    choice.roleId ? assignedRoleId === choice.roleId : memberRole === choice.role && !holdsCustom

  const adminLabel = intl.formatMessage({
    id: 'admin.people.invite.admin',
    defaultMessage: 'Admin',
  })
  const memberLabel = intl.formatMessage({
    id: 'admin.people.invite.member',
    defaultMessage: 'Member',
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage(
              {
                id: 'admin.settings.team.memberActions.actionsFor',
                defaultMessage: 'Actions for {name}',
              },
              { name: memberName }
            )}
            className="size-7 text-muted-foreground"
          >
            <EllipsisHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            {intl.formatMessage({
              id: 'admin.settings.team.memberActions.changeRole',
              defaultMessage: 'Change role',
            })}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="gap-2"
            disabled={!canChangeRole || isCurrent({ role: 'admin' })}
            onClick={() => setPendingRole({ role: 'admin', label: adminLabel })}
          >
            <ShieldCheckIcon className="h-4 w-4" />
            {adminLabel}
            {isCurrent({ role: 'admin' }) && <CheckIcon className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            disabled={!canChangeRole || isCurrent({ role: 'member' })}
            onClick={() => setPendingRole({ role: 'member', label: memberLabel })}
          >
            <UserIcon className="h-4 w-4" />
            {memberLabel}
            {isCurrent({ role: 'member' }) && <CheckIcon className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
          {customRoles.length > 0 && (
            <>
              <DropdownMenuLabel className="uppercase tracking-wider text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.settings.security.idp.table.custom',
                  defaultMessage: 'Custom',
                })}
              </DropdownMenuLabel>
              {customRoles.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  disabled={!canChangeRole || isCurrent({ role: 'member', roleId: r.id })}
                  onClick={() => setPendingRole({ role: 'member', roleId: r.id, label: r.name })}
                >
                  {r.name}
                  {isCurrent({ role: 'member', roleId: r.id }) && (
                    <CheckIcon className="ml-auto h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          {userId ? (
            <DropdownMenuItem onClick={() => setResetTfaDialogOpen(true)} className="gap-2">
              <ShieldExclamationIcon className="h-4 w-4" />
              {intl.formatMessage({
                id: 'admin.settings.team.memberActions.resetTwoFactor',
                defaultMessage: 'Reset two-factor',
              })}
            </DropdownMenuItem>
          ) : null}
          {userId ? (
            <DropdownMenuItem onClick={() => setForceSignOutDialogOpen(true)} className="gap-2">
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              {intl.formatMessage({
                id: 'admin.settings.team.memberActions.signOutEverywhere',
                defaultMessage: 'Sign out everywhere',
              })}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setRemoveDialogOpen(true)}
            disabled={!canRemove}
            variant="destructive"
            className="gap-2"
          >
            <UserMinusIcon className="h-4 w-4" />
            {intl.formatMessage({
              id: 'admin.settings.team.memberActions.removeFromTeam',
              defaultMessage: 'Remove from team',
            })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pendingRole != null}
        onOpenChange={(open) => !open && setPendingRole(null)}
        title={intl.formatMessage(
          {
            id: 'admin.settings.team.memberActions.changeRoleTitle',
            defaultMessage: 'Change role to {role}?',
          },
          { role: pendingRole?.label ?? '' }
        )}
        description={
          pendingRole?.role === 'admin' ? (
            <FormattedMessage
              id="admin.settings.team.memberActions.changeRoleAdminDesc"
              defaultMessage="<strong>{name}</strong> will be able to manage team settings, members, and all workspace configurations."
              values={{
                name: memberName,
                strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
              }}
            />
          ) : pendingRole?.roleId ? (
            <FormattedMessage
              id="admin.settings.team.memberActions.changeRoleCustomDesc"
              defaultMessage='<strong>{name}</strong> will hold the "{role}" role and exactly the permissions it grants.'
              values={{
                name: memberName,
                role: pendingRole.label,
                strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
              }}
            />
          ) : (
            <FormattedMessage
              id="admin.settings.team.memberActions.changeRoleMemberDesc"
              defaultMessage="<strong>{name}</strong> will no longer be able to manage team settings or members."
              values={{
                name: memberName,
                strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
              }}
            />
          )
        }
        confirmLabel={
          isLoading
            ? intl.formatMessage({
                id: 'admin.settings.team.memberActions.updating',
                defaultMessage: 'Updating...',
              })
            : intl.formatMessage(
                {
                  id: 'admin.settings.team.memberActions.changeTo',
                  defaultMessage: 'Change to {role}',
                },
                { role: pendingRole?.label ?? '' }
              )
        }
        isPending={isLoading}
        onConfirm={handleRoleChange}
      />

      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={intl.formatMessage({
          id: 'admin.settings.team.memberActions.removeTitle',
          defaultMessage: 'Remove team member?',
        })}
        description={
          <FormattedMessage
            id="admin.settings.team.memberActions.removeDesc"
            defaultMessage="<strong>{name}</strong> will be removed from the team and converted to a portal user. They will lose access to the admin dashboard but can still interact with the feedback portal."
            values={{
              name: memberName,
              strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
            }}
          />
        }
        variant="destructive"
        confirmLabel={
          isLoading
            ? intl.formatMessage({
                id: 'admin.settings.team.memberActions.removing',
                defaultMessage: 'Removing...',
              })
            : intl.formatMessage({
                id: 'admin.settings.team.memberActions.removeFromTeam',
                defaultMessage: 'Remove from team',
              })
        }
        isPending={isLoading}
        onConfirm={handleRemove}
      />

      <ConfirmDialog
        open={resetTfaDialogOpen}
        onOpenChange={setResetTfaDialogOpen}
        title={intl.formatMessage({
          id: 'admin.settings.team.memberActions.resetTfaTitle',
          defaultMessage: 'Reset two-factor authentication?',
        })}
        description={
          <FormattedMessage
            id="admin.settings.team.memberActions.resetTfaDesc"
            defaultMessage="<strong>{name}</strong>'s two-factor enrollment will be cleared and any trusted devices revoked. They'll be able to sign in with just their password until they re-enroll. Use this only when they've lost their authenticator and backup codes."
            values={{
              name: memberName,
              strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
            }}
          />
        }
        variant="destructive"
        confirmLabel={
          isLoading
            ? intl.formatMessage({
                id: 'admin.settings.team.memberActions.resetting',
                defaultMessage: 'Resetting...',
              })
            : intl.formatMessage({
                id: 'admin.settings.team.memberActions.resetTwoFactor',
                defaultMessage: 'Reset two-factor',
              })
        }
        isPending={isLoading}
        onConfirm={handleResetTfa}
      />

      <ConfirmDialog
        open={forceSignOutDialogOpen}
        onOpenChange={setForceSignOutDialogOpen}
        title={intl.formatMessage({
          id: 'admin.settings.team.memberActions.signOutTitle',
          defaultMessage: 'Sign out everywhere?',
        })}
        description={
          <FormattedMessage
            id="admin.settings.team.memberActions.signOutDesc"
            defaultMessage="All active sessions for <strong>{name}</strong> will be revoked. They'll need to sign in again on every device. Use this when an account is compromised, a device is lost, or a team member is leaving."
            values={{
              name: memberName,
              strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
            }}
          />
        }
        variant="destructive"
        confirmLabel={
          isLoading
            ? intl.formatMessage({
                id: 'admin.settings.team.memberActions.signingOut',
                defaultMessage: 'Signing out...',
              })
            : intl.formatMessage({
                id: 'admin.settings.team.memberActions.signOutEverywhere',
                defaultMessage: 'Sign out everywhere',
              })
        }
        isPending={isLoading}
        onConfirm={handleForceSignOut}
      />
    </>
  )
}
