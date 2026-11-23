/**
 * CLI: the newest portal-access invitation for an email, for e2e tests.
 *
 * Prints `{ invitationId, status, email }`. Portal invitations are
 * `kind='portal'` rows (separate from team invitations), minted by the
 * portal-access settings page; the invitee accepts at
 * `/portal-invite/<invitationId>`.
 *
 * Usage: bun get-portal-invitation.ts <email>
 */
import { fromUuid } from '@quackback/ids'
import { openDb } from './_lib'

const email = process.argv[2]
if (!email) {
  console.error('Usage: bun get-portal-invitation.ts <email>')
  process.exit(1)
}

const sql = openDb()

try {
  const rows = await sql`
    SELECT id, email, status
    FROM invitation
    WHERE lower(email) = lower(${email}) AND kind = 'portal'
    ORDER BY created_at DESC
    LIMIT 1`
  if (rows.length === 0) throw new Error(`No portal invitation found for ${email}`)

  console.log(
    JSON.stringify({
      // The row's id is the raw UUID; the routes and invites use the TypeID.
      invitationId: fromUuid('invite', rows[0].id as string),
      status: rows[0].status,
      email: rows[0].email,
    })
  )
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
