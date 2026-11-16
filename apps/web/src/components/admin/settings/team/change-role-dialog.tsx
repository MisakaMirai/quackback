import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/shared/form-error'
import { usersKeys } from '@/lib/client/hooks/use-users-queries'
import { changeTeamRoleFn } from '@/lib/server/functions/team-people'
import type { ChangeRoleRefusalCode } from '@/lib/shared/team-people'
import { withArticle, type RoleChoice } from '@/components/admin/settings/team/add-people'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import type { IntlShape } from 'react-intl'
import {
  RoleNotes,
  RoleSelect,
  roleValueOf,
  useRoleChoice,
} from '@/components/admin/settings/team/role-select'

export interface ChangeRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  principalId: string
  personName: string
  /** The role the person holds now. */
  current: RoleChoice
  canGrantAdmin: boolean
  onChanged?: (role: RoleChoice) => void
}

/** Why a change was refused, in plain words. GRANT_CEILING shows by the field instead. */
function refusalCopy(code: ChangeRoleRefusalCode, personName: string, intl: IntlShape): string {
  switch (code) {
    case 'LAST_ADMIN':
      return intl.formatMessage(
        {
          id: 'admin.settings.team.changeRole.lastAdmin',
          defaultMessage: '{name} is the last admin. Make someone else an admin first.',
        },
        { name: personName }
      )
    case 'CANNOT_MODIFY_SELF':
      return intl.formatMessage({
        id: 'admin.settings.team.changeRole.self',
        defaultMessage: "You can't change your own role.",
      })
    case 'SEAT_LIMIT':
      return intl.formatMessage({
        id: 'admin.settings.team.changeRole.noSeats',
        defaultMessage: 'The plan has no seats left for this role.',
      })
    case 'NOT_ELIGIBLE':
      return intl.formatMessage(
        {
          id: 'admin.settings.team.changeRole.notEligible',
          defaultMessage: "{name} can't hold a team role.",
        },
        { name: personName }
      )
    case 'NOT_FOUND':
      return intl.formatMessage(
        {
          id: 'admin.settings.team.changeRole.notFound',
          defaultMessage: '{name} is no longer on the team.',
        },
        { name: personName }
      )
    default:
      return intl.formatMessage({
        id: 'admin.settings.team.changeRole.failed',
        defaultMessage: "Couldn't change the role. Try again.",
      })
  }
}

/** Change a teammate's role from outside the Members table. */
export function ChangeRoleDialog({ open, onOpenChange, ...rest }: ChangeRoleDialogProps) {
  const intl = useOptionalIntl()
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage(
              {
                id: 'admin.settings.team.changeRole.title',
                defaultMessage: "Change {name}'s role",
              },
              { name: rest.personName }
            )}
          </DialogTitle>
        </DialogHeader>
        <ChangeRoleForm key={session} onClose={() => onOpenChange(false)} {...rest} />
      </DialogContent>
    </Dialog>
  )
}

function ChangeRoleForm({
  principalId,
  personName,
  current,
  canGrantAdmin,
  onChanged,
  onClose,
}: Omit<ChangeRoleDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const initial = roleValueOf(current)
  const [value, setValue] = useState(initial)
  const role = useRoleChoice(value, current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ refusedGrant: boolean; message: string } | null>(null)
  const refused = error?.refusedGrant ?? false

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await changeTeamRoleFn({
        data: {
          principalId,
          role: role.role,
          ...(role.roleId ? { roleId: role.roleId } : {}),
        },
      })
      if (!result.ok) {
        setError({
          refusedGrant: result.code === 'GRANT_CEILING',
          message: refusalCopy(result.code, personName, intl),
        })
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'team'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: usersKeys.all }),
      ])
      onChanged?.(role)
      toast.success(
        intl.formatMessage(
          {
            id: 'admin.settings.team.changeRole.success',
            defaultMessage: '{name} is now {role}.',
          },
          {
            name: personName,
            // English needs the article ("an Editor"); Chinese does not.
            role: intl.locale.startsWith('en') ? withArticle(role.label) : role.label,
          }
        )
      )
      onClose()
    } catch {
      // Never raw server text: a failed call reads the same whatever went wrong.
      setError({
        refusedGrant: false,
        message: intl.formatMessage({
          id: 'admin.settings.team.changeRole.failed',
          defaultMessage: "Couldn't change the role. Try again.",
        }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {error && !refused && <FormError message={error.message} />}
      <div className="space-y-1.5">
        <Label htmlFor="change-role-select">
          {intl.formatMessage({ id: 'apiKeys.column.role', defaultMessage: 'Role' })}
        </Label>
        <RoleSelect
          id="change-role-select"
          value={value}
          onValueChange={(v) => {
            setValue(v)
            if (refused) setError(null)
          }}
          canGrantAdmin={canGrantAdmin}
          invalid={refused}
          held={current}
        />
        <RoleNotes role={role} refused={refused} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={saving || value === initial}>
          {saving
            ? intl.formatMessage({
                id: 'admin.settings.team.changeRole.saving',
                defaultMessage: 'Saving...',
              })
            : intl.formatMessage({
                id: 'admin.settings.team.changeRole.submit',
                defaultMessage: 'Change role',
              })}
        </Button>
      </DialogFooter>
    </form>
  )
}
