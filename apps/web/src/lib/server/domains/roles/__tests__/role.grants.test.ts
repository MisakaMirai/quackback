import { describe, expect, it } from 'vitest'
import { ForbiddenError } from '@/lib/shared/errors'
import { assertCanChangeTeamRole, assertCanGrantTeamRole } from '../role.grants'

/**
 * The legacy-tier grant ceiling: the Admin role (the Owner tier) is granted
 * only by an admin, and changing someone who already holds Admin is reserved
 * to admins too. Both fail closed when the granter's role is unknown, so
 * `member.manage` alone cannot hand out or strip a tier above its own.
 */
describe('assertCanGrantTeamRole', () => {
  it('lets an admin grant the Admin role', () => {
    expect(() => assertCanGrantTeamRole('admin', 'admin')).not.toThrow()
  })

  it('refuses a member granting the Admin role', () => {
    expect(() => assertCanGrantTeamRole('admin', 'member')).toThrow(ForbiddenError)
    try {
      assertCanGrantTeamRole('admin', 'member')
    } catch (error) {
      expect((error as ForbiddenError).code).toBe('GRANT_CEILING')
      expect((error as ForbiddenError).message).toBe('Only an admin can grant the Admin role')
    }
  })

  it('fails closed when the granter role is unknown', () => {
    expect(() => assertCanGrantTeamRole('admin', undefined)).toThrow(ForbiddenError)
    expect(() => assertCanGrantTeamRole('admin', null)).toThrow(ForbiddenError)
  })

  it('lets anyone grant a member role', () => {
    // The member tier is the ceiling's floor: adding a member never exceeds
    // the granter, whatever role they hold.
    expect(() => assertCanGrantTeamRole('member', 'member')).not.toThrow()
    expect(() => assertCanGrantTeamRole('member', 'user')).not.toThrow()
    expect(() => assertCanGrantTeamRole('member', undefined)).not.toThrow()
  })
})

describe('assertCanChangeTeamRole', () => {
  it('lets an admin change an admin', () => {
    expect(() => assertCanChangeTeamRole('admin', 'admin')).not.toThrow()
  })

  it('refuses a member changing an admin', () => {
    expect(() => assertCanChangeTeamRole('admin', 'member')).toThrow(ForbiddenError)
    try {
      assertCanChangeTeamRole('admin', 'member')
    } catch (error) {
      expect((error as ForbiddenError).code).toBe('GRANT_CEILING')
      expect((error as ForbiddenError).message).toBe('Only an admin can change or remove an admin')
    }
  })

  it('fails closed when the granter role is unknown', () => {
    expect(() => assertCanChangeTeamRole('admin', undefined)).toThrow(ForbiddenError)
    expect(() => assertCanChangeTeamRole('admin', null)).toThrow(ForbiddenError)
  })

  it('lets anyone change a non-admin target', () => {
    expect(() => assertCanChangeTeamRole('member', 'member')).not.toThrow()
    expect(() => assertCanChangeTeamRole('member', 'user')).not.toThrow()
    expect(() => assertCanChangeTeamRole('member', undefined)).not.toThrow()
  })
})
