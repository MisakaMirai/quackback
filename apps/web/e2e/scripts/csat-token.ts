/**
 * CLI: mint/read the CSAT-over-email fixtures, for e2e tests.
 *
 * `mint <conversationTypeId>` clears the conversation's CSAT fields (so
 * repeated runs start from "unrated") and mints the same HMAC-signed token the
 * rating-request email carries. Prints `{ token }`.
 *
 * `state <conversationTypeId>` prints the stored rating/comment, so a test can
 * prove the page's GET records nothing and a face click does.
 *
 * The token is minted through the app's own `mintCsatEmailToken`, keyed on the
 * workspace SECRET_KEY, so it verifies exactly like a token from a real email.
 *
 * Usage:
 *   bun csat-token.ts mint <conversationTypeId>
 *   bun csat-token.ts state <conversationTypeId>
 */
import { fromUuid, toUuid } from '@quackback/ids'
import { mintCsatEmailToken } from '@/lib/server/domains/conversation/csat-email-token'
import { openDb } from './_lib'

const [command, conversationTypeId] = process.argv.slice(2)

if ((command !== 'mint' && command !== 'state') || !conversationTypeId) {
  console.error('Usage: bun csat-token.ts <mint|state> <conversationTypeId>')
  process.exit(1)
}

const sql = openDb()

try {
  const conversationUuid = toUuid(conversationTypeId)
  const rows = await sql`
    SELECT id, visitor_principal_id, csat_rating, csat_comment, csat_submitted_at
    FROM conversations WHERE id = ${conversationUuid} LIMIT 1`
  if (rows.length === 0) {
    throw new Error(`Conversation not found: ${conversationTypeId}`)
  }

  if (command === 'state') {
    console.log(
      JSON.stringify({
        csatRating: rows[0].csat_rating ?? null,
        csatComment: rows[0].csat_comment ?? null,
        csatSubmittedAt: rows[0].csat_submitted_at ?? null,
      })
    )
  } else {
    await sql`
      UPDATE conversations
      SET csat_rating = NULL, csat_comment = NULL, csat_submitted_at = NULL
      WHERE id = ${conversationUuid}`

    const token = mintCsatEmailToken(
      conversationTypeId as never,
      fromUuid('principal', rows[0].visitor_principal_id as string)
    )
    console.log(JSON.stringify({ token }))
  }
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
