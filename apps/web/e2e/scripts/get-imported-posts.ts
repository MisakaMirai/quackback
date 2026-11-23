/**
 * CLI: posts whose title starts with a prefix, for import e2e tests.
 *
 * Prints `[{ title, boardName, boardSlug }]`. Import titles are made unique per
 * run by the spec, so a prefix match finds exactly the rows that run created.
 *
 * Usage: bun get-imported-posts.ts "<title prefix>"
 */
import { openDb } from './_lib'

const prefix = process.argv[2]
if (!prefix) {
  console.error('Usage: bun get-imported-posts.ts "<title prefix>"')
  process.exit(1)
}

const sql = openDb()

try {
  const rows = await sql`
    SELECT p.title, b.name AS board_name, b.slug AS board_slug
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    WHERE p.title LIKE ${prefix + '%'} AND p.deleted_at IS NULL
    ORDER BY p.title`
  console.log(
    JSON.stringify(
      rows.map((row) => ({
        title: row.title,
        boardName: row.board_name,
        boardSlug: row.board_slug,
      }))
    )
  )
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
