/**
 * Token minting the harness has to do for itself.
 *
 * The construction below is a re-implementation of production code, which is
 * a drift risk: if the server changes its scheme and the harness does not, the
 * probe mints a token nothing accepts, every cross-workspace attempt is refused for
 * the wrong reason, and the suite reports isolation it never tested.
 *
 * Two defences. The positive control in the probe fails loudly the moment a
 * minted token stops being accepted by its own workspace. And
 * `__tests__/crypto-drift.test.ts` asserts these functions against the real
 * verifiers imported from the app, so drift breaks `bun run test` rather than
 * quietly weakening a probe.
 */

import { createHmac } from 'node:crypto'

/**
 * The private-object read capability from `lib/server/storage/s3.ts`.
 *
 * Mirrors `storageReadSig`, which is module-private there:
 *   HMAC-SHA256(secret, `read|${key}`) → hex → first 32 chars.
 *
 * SAAS-HOSTING-STACK.md §9 names the hazard this probes: the signature is
 * HMAC'd with `s3Config.secretAccessKey`, so a single shared bucket across
 * workspaces means a single shared secret, and a capability minted for workspace A's
 * key verifies against workspace B's. Cross-workspace private-file read by construction.
 */
export function mintStorageReadSig(secret: string, key: string, workspaceKey?: string): string {
  return createHmac('sha256', secret)
    .update(storageReadMessage(key, workspaceKey))
    .digest('hex')
    .slice(0, 32)
}

/**
 * The message `verifyStorageReadToken` HMACs.
 *
 * Under pooled tenancy the app binds the workspace into it (`workspaceBind` in
 * `lib/server/storage/s3.ts`): object keys are per-bucket, so `uploads/<uuid>`
 * names a different object in every workspace while reading identically, and
 * without the binding a capability minted for one workspace would verify against
 * another's object on any shared secret.
 *
 * A single-workspace deployment signs the historical message byte for byte —
 * those signatures are embedded in absolute URLs already written into stored
 * content — so the workspace id is optional here and its absence reproduces the
 * old message exactly.
 */
export function storageReadMessage(key: string, workspaceKey?: string): string {
  return workspaceKey ? `t:${workspaceKey}|read|${key}` : `read|${key}`
}
