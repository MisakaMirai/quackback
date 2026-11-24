/**
 * CLI: create (or re-use) a `files` row without going through object storage.
 *
 * A composer upload normally writes this row from the stored bytes. E2E runs
 * have no object store (CI writes a `.env` without S3, and the isolated
 * servers have at best dummy credentials), so a spec that needs a message
 * attachment seeds the row here and stubs the browser's upload POST + storage
 * GET. `resolveAttachments` requires the row to exist for a submitted
 * `fileId`, so this is the seam that makes the send path real.
 *
 * Idempotent on the unique `storage_key`: re-running updates the display
 * fields, clears a retention-sweep tombstone and returns the same file id, so
 * repeated local runs do not accumulate rows or violate the unique index.
 *
 * Prints `{ fileId, storageKey, name, contentType, size, family }` where
 * `fileId` is the TypeID form the API and message payloads use.
 *
 * Usage: bun seed-file.ts <storage-key> [name] [contentType] [size]
 */
import { createHash } from 'crypto'
import { fromUuid, generateId, toUuid } from '@quackback/ids'
import { openDb } from './_lib'

const [storageKey, nameArg, contentTypeArg, sizeArg] = process.argv.slice(2)

if (!storageKey) {
  console.error('Usage: bun seed-file.ts <storage-key> [name] [contentType] [size]')
  process.exit(1)
}

const name = nameArg || storageKey.split('/').pop() || 'file'
const contentType = contentTypeArg || 'image/png'
const size = Number(sizeArg ?? 2048)
if (!Number.isFinite(size) || size < 0) {
  console.error('size must be a non-negative number')
  process.exit(1)
}
const family = contentType.startsWith('image/') ? 'image' : 'other'
// The column is NOT NULL and only meaningful for real stored bytes; a stable
// digest of the identity lets the row look like a normal upload.
const sha256 = createHash('sha256').update(`${storageKey}:${name}`).digest('hex')

const sql = openDb()
try {
  const rows = await sql`
    INSERT INTO files
      (id, storage_key, name, content_type, family, size, sha256, source,
       preview_status, meta, deleted_at)
    VALUES
      (${toUuid(generateId('file'))}, ${storageKey}, ${name}, ${contentType},
       ${family}, ${size}, ${sha256}, 'agent', 'none', ${sql.json({})}, NULL)
    ON CONFLICT (storage_key) DO UPDATE SET
      name = EXCLUDED.name,
      content_type = EXCLUDED.content_type,
      family = EXCLUDED.family,
      size = EXCLUDED.size,
      deleted_at = NULL
    RETURNING id, storage_key, name, content_type, family, size`

  const row = rows[0]!
  console.log(
    JSON.stringify({
      fileId: fromUuid('file', row.id as string),
      storageKey: row.storage_key,
      name: row.name,
      contentType: row.content_type,
      size: Number(row.size),
      family: row.family,
    })
  )
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
} finally {
  await sql.end()
}
