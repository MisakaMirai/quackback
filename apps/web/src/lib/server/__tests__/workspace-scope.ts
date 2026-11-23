/**
 * Pinning the storage namespace in tests.
 *
 * Production resolves the namespace from `settings.id` (see
 * `lib/server/storage/namespace.ts`). A unit test has no database, so it pins a
 * derived id instead for the duration of one call.
 */
import { createHash } from 'node:crypto'
import { fromUuid, type WorkspaceId } from '@quackback/ids'
import { __setWorkspaceIdForTests } from '@/lib/server/storage/namespace'

/** A distinct `settings.id` per key, derived rather than shared. */
export function workspaceUuidFor(workspaceKey: string): string {
  const hex = createHash('sha256').update(workspaceKey).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `7${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

/** The branded form of {@link workspaceUuidFor}. */
export function workspaceIdFor(workspaceKey: string): WorkspaceId {
  return fromUuid('workspace', workspaceUuidFor(workspaceKey))
}

/**
 * A legal mail slug for a key, derived rather than constant.
 *
 * The product mints under one fixed label (`SELF_HOSTED_MAIL_SLUG`); this stays
 * for the address-grammar tests, which need two distinct legal slugs.
 */
export function mailSlugFor(workspaceKey: string): string {
  const reduced = workspaceKey
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 13)
    .replace(/^-+|-+$/g, '')
  return reduced === '' ? 'ws' : reduced
}

/**
 * Run `fn` with the storage namespace pinned to `workspaceKey`'s derived id.
 *
 * A promise result keeps the pin until it settles, so an async body addresses
 * one namespace throughout. The third parameter is accepted and ignored so call
 * sites written for the removed per-install overrides still compile; cases that
 * depended on those overrides belong with the code they tested and were deleted.
 */
export function withWorkspace<T>(workspaceKey: string, fn: () => T, _overrides?: unknown): T {
  __setWorkspaceIdForTests(workspaceIdFor(workspaceKey))
  const out = fn()
  if (out instanceof Promise) {
    return out.finally(() => __setWorkspaceIdForTests(null)) as T
  }
  __setWorkspaceIdForTests(null)
  return out
}
