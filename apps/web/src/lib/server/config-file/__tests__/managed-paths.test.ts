import { describe, it, expect } from 'vitest'
import { computeManagedPaths, isPathManaged } from '../managed-paths'

describe('computeManagedPaths', () => {
  it('returns [] for an empty spec', () => {
    expect(computeManagedPaths({})).toEqual([])
  })

  it('emits leaf paths for workspace.* fields', () => {
    expect(
      computeManagedPaths({
        workspace: { name: 'X', slug: 'x', useCase: 'saas' },
      })
    ).toEqual(['workspace.name', 'workspace.slug', 'workspace.useCase'])
  })

  it('omits workspace leaves that are absent', () => {
    expect(computeManagedPaths({ workspace: { name: 'X' } })).toEqual(['workspace.name'])
  })

  it('does not emit managed paths for deprecated auth and features keys', () => {
    expect(
      computeManagedPaths({
        auth: { oauth: { google: true } },
        features: { helpCenter: true },
      })
    ).toEqual([])
  })
})

describe('isPathManaged', () => {
  it('matches an exact path', () => {
    expect(isPathManaged('workspace.name', ['workspace.name'])).toBe(true)
  })

  it('matches a child of a whole-block managed path', () => {
    expect(isPathManaged('workspace.extra.child', ['workspace.extra'])).toBe(true)
  })

  it('does not match a different leaf under the same parent', () => {
    expect(isPathManaged('features.a', ['features.b'])).toBe(false)
  })

  it('does not match an unrelated path', () => {
    expect(isPathManaged('portalConfig.oauth.google.enabled', ['workspace.name'])).toBe(false)
  })

  it('returns false for an empty managed list', () => {
    expect(isPathManaged('workspace.name', [])).toBe(false)
  })
})
