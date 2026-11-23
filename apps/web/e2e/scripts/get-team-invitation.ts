/**
 * CLI: the newest team invitation for an email, for e2e tests.
 *
 * Prints `{ invitationId, status, role, email }`. The row is the one the
 * members page's add-people dialog created; `status` is Better-Auth's
 * pending/accepted/canceled, and `invitationId` is the TypeID the invite's
 * magic link lands on (`/complete-signup/<id>`).
 *
 * Usage: bun get-team-invitation.ts <email>
 */
import { openDb } from './_lib'

const email = process.argv[2]
if (!email) {
  console.error('Usage: bun get-team-invitation.ts <email>')
  process.exit(1)
}

const sql = openDb()

try {
  const rows = await sql`
    SELECT id, email, status, role
    FROM invitation
    WHERE lower(email) = lower(${email}) AND kind = 'team'
    ORDER BY created_at DESC
    LIMIT 1`
  if (rows.length === 0) throw new Error(`No team invitation found for ${email}`)

  console.log(
    JSON.stringify({
      invitationId: rows[0].id,
      status: rows[0].status,
      role: rows[0].role,
      email: rows[0].email,
    })
  )
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
