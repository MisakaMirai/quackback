/**
 * CLI: one principal's notification preferences, for e2e tests.
 *
 * Prints `{ emailMuted, emailStatusChange, emailNewComment, matrix }` — the
 * fields the portal Preferences page writes. The user must have signed in
 * once (the principal is resolved through `"user"`).
 *
 * Usage: bun get-notification-preferences.ts <email>
 */
import { openDb } from './_lib'

const email = process.argv[2]
if (!email) {
  console.error('Usage: bun get-notification-preferences.ts <email>')
  process.exit(1)
}

const sql = openDb()

try {
  const users = await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`
  if (users.length === 0) throw new Error(`User not found: ${email}`)
  const principals = await sql`SELECT id FROM principal WHERE user_id = ${users[0].id} LIMIT 1`
  if (principals.length === 0) throw new Error(`Principal not found for ${email}`)
  const principalId = principals[0].id as string

  const rows = await sql`
    SELECT email_muted, email_status_change, email_new_comment, matrix
    FROM notification_preferences
    WHERE principal_id = ${principalId}
    LIMIT 1`
  if (rows.length === 0) throw new Error(`No notification preferences row for ${email}`)

  console.log(
    JSON.stringify({
      emailMuted: rows[0].email_muted,
      emailStatusChange: rows[0].email_status_change,
      emailNewComment: rows[0].email_new_comment,
      matrix: rows[0].matrix ?? {},
    })
  )
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
