/**
 * CLI: the live password-reset token for an email, for e2e tests.
 *
 * Better-Auth stores the emailed reset token in the `verification` table as
 * `reset-password:<token>`, with the *TypeID* of the user as its value (the
 * `"user"` row's `id` column is the raw UUID the TypeID encodes). The row is
 * written shortly after `request-password-reset` answers, so this polls for it
 * instead of racing the write.
 *
 * Usage: bun get-reset-token.ts <email>
 */
import { fromUuid } from '@quackback/ids'
import { openDb } from './_lib'

const email = process.argv[2]
if (!email) {
  console.error('Usage: bun get-reset-token.ts <email>')
  process.exit(1)
}

const sql = openDb()

try {
  const users = await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`
  if (users.length === 0) throw new Error(`User not found: ${email}`)
  const userTypeId = fromUuid('user', users[0].id as string)

  let token: string | null = null
  for (let attempt = 0; attempt < 20 && !token; attempt += 1) {
    const rows = await sql`
      SELECT identifier FROM verification
      WHERE identifier LIKE 'reset-password:%'
        AND value = ${userTypeId}
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`
    if (rows.length > 0) token = String(rows[0].identifier).replace(/^reset-password:/, '')
    else await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!token) throw new Error(`No live reset-password row found for ${email}`)

  console.log(token)
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
