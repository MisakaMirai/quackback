import { describe, expect, it } from 'vitest'
import { cloudMembershipActions } from '../workspace-ownership'

describe('cloud membership actions', () => {
  it('shows nothing when no owner address is known', () => {
    expect(
      cloudMembershipActions({
        ownerEmail: null,
        currentEmail: 'owner@example.com',
      })
    ).toEqual({ showTransfer: false, showLeave: false, isOwner: false })
  })

  it('lets the owner transfer the workspace, and never leave it', () => {
    expect(
      cloudMembershipActions({
        ownerEmail: 'Owner@Example.com',
        currentEmail: 'owner@example.com',
      })
    ).toEqual({ showTransfer: true, showLeave: false, isOwner: true })
  })

  it('lets a teammate leave, and never transfer', () => {
    expect(
      cloudMembershipActions({
        ownerEmail: 'owner@example.com',
        currentEmail: 'mate@example.com',
      })
    ).toEqual({ showTransfer: false, showLeave: true, isOwner: false })
  })
})
