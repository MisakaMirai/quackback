/**
 * CLI: the newest status incident with a given title, for e2e tests.
 *
 * Prints `{ incidentId, status, title }`. The row's id is the raw UUID; the
 * public and admin routes use the `status_incident_…` TypeID, so it is
 * converted here.
 *
 * Usage: bun get-status-incident.ts "<title>"
 */
import { fromUuid } from '@quackback/ids'
import { openDb } from './_lib'

const title = process.argv[2]
if (!title) {
  console.error('Usage: bun get-status-incident.ts "<title>"')
  process.exit(1)
}

const sql = openDb()

try {
  const rows = await sql`
    SELECT id, title, status
    FROM status_incidents
    WHERE title = ${title} AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1`
  if (rows.length === 0) throw new Error(`No status incident found with title: ${title}`)

  console.log(
    JSON.stringify({
      incidentId: fromUuid('status_incident', rows[0].id as string),
      status: rows[0].status,
      title: rows[0].title,
    })
  )
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
