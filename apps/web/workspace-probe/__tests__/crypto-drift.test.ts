/**
 * Drift pin for the token the harness has to mint for itself.
 *
 * `crypto.ts` re-implements schemes whose production originals are module-private
 * (`storageReadSig` in `lib/server/storage/s3.ts`) or live behind a different
 * import boundary. If the server changes its construction and the harness does
 * not, every cross-workspace attempt is refused because the token is malformed —
 * a false PASS on the exact probe that was supposed to be watching.
 *
 * These tests assert the minted token against the REAL verifier, so drift breaks
 * `bun run test` rather than silently weakening a probe.
 */

import { describe, expect, it } from 'vitest'
import { verifyStorageReadToken } from '@/lib/server/storage/s3'
import { mintStorageReadSig } from '../crypto'

describe('storage read capability', () => {
  const secret = 'a-workspace-storage-secret'
  const key = 'uploads/2026/08/some-object.bin'

  it('mints a signature the production verifier accepts', () => {
    expect(verifyStorageReadToken(secret, key, mintStorageReadSig(secret, key))).toBe(true)
  })

  it('is rejected under a different secret — the whole basis of P03', () => {
    const otherWorkspaceSig = mintStorageReadSig('a-different-workspace-secret', key)
    expect(verifyStorageReadToken(secret, key, otherWorkspaceSig)).toBe(false)
  })

  it('is bound to the key, so P03 must hold the key constant across workspaces', () => {
    const sig = mintStorageReadSig(secret, key)
    expect(verifyStorageReadToken(secret, 'uploads/2026/08/another-object.bin', sig)).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifyStorageReadToken(secret, key, null)).toBe(false)
  })
})
