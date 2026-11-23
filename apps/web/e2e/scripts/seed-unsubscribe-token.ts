/**
 * CLI: the fixtures behind the emailed unsubscribe link, for e2e tests.
 *
 * `seed <email> <action>` resolves the principal for an existing user (the
 * user must have signed in once, like the other seed scripts), resets that
 * principal's notification preferences to the all-on baseline, and inserts one
 * live token for `action`. Prints `{ token, principalId }`.
 *
 * `state <email>` prints the preferences the confirmation page would change —
 * so a test can prove that opening the link writes nothing and confirming does.
 *
 * The token is a plain UUID row in `unsubscribe_tokens`, exactly what
 * `generateUnsubscribeToken` writes; no server module is imported here, so the
 * script stays runnable before the app is built.
 *
 * Usage:
 *   bun seed-unsubscribe-token.ts seed <email> <unsubscribe_all|unsubscribe_post|unsubscribe_changelog>
 *   bun seed-unsubscribe-token.ts state <email>
 */
import { randomUUID } from 'crypto'
import { openDb } from './_lib'

const [command, value, action] = process.argv.slice(2)

if (command !== 'seed' && command !== 'state') {
  console.error('Usage: bun seed-unsubscribe-token.ts <seed|state> <email> [action]')
  process.exit(1)
}
if (!value) {
  console.error('Usage: bun seed-unsubscribe-token.ts <seed|state> <email> [action]')
  process.exit(1)
}
if (command === 'seed' && !action) {
  console.error('seed needs an action: unsubscribe_all | unsubscribe_post | unsubscribe_changelog')
  process.exit(1)
}

const sql = openDb()

/** Resolve the principal for an existing user email. */
async function principalForEmail(email: string): Promise<string> {
  const users = await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`
  if (users.length === 0) {
    throw new Error(`User not found: ${email} (sign the user in once first)`)
  }
  const rows = await sql`SELECT id FROM principal WHERE user_id = ${users[0].id} LIMIT 1`
  if (rows.length === 0) {
    throw new Error(`Principal not found for ${email}`)
  }
  return rows[0].id as string
}

try {
  const principalId = await principalForEmail(value)

  if (command === 'state') {
    const prefs = await sql`
      SELECT email_status_change, email_new_comment, email_muted
      FROM notification_preferences WHERE principal_id = ${principalId} LIMIT 1`
    console.log(
      JSON.stringify({
        emailStatusChange: prefs[0]?.email_status_change ?? null,
        emailNewComment: prefs[0]?.email_new_comment ?? null,
        emailMuted: prefs[0]?.email_muted ?? null,
      })
    )
  } else {
    // Deterministic baseline: every switch on, so "the page changed nothing"
    // and "confirming flipped this one" are both observable.
    const existing = await sql`
      SELECT id FROM notification_preferences WHERE principal_id = ${principalId} LIMIT 1`
    if (existing.length > 0) {
      await sql`
        UPDATE notification_preferences
        SET email_status_change = true, email_new_comment = true, email_muted = false, updated_at = NOW()
        WHERE principal_id = ${principalId}`
    } else {
      await sql`
        INSERT INTO notification_preferences
          (id, principal_id, email_status_change, email_new_comment, email_muted, created_at, updated_at)
        VALUES (${randomUUID()}, ${principalId}, true, true, false, NOW(), NOW())`
    }

    const token = randomUUID()
    await sql`
      INSERT INTO unsubscribe_tokens (id, token, principal_id, post_id, action, expires_at, created_at)
      VALUES (${randomUUID()}, ${token}, ${principalId}, NULL, ${action},
              NOW() + make_interval(days => 30), NOW())`

    console.log(JSON.stringify({ token, principalId }))
  }
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
