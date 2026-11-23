/**
 * Regression coverage for the 500 on updating an existing user's metadata.
 *
 * Two bugs lived in this one statement:
 *  - Drizzle's `sql` template flattens a JS array into one parameter per
 *    element, so `- ${metadataRemovals}::text[]` rendered `()::text[]` (no
 *    removals), `($1)::text[]` (one) or `($1, $2)::text[]` (several).
 *  - While moving the removals into an `ARRAY[...]` constructor, one closing
 *    paren was dropped, so the update stayed a syntax error.
 *
 * `PgDialect.sqlToQuery` only renders text — it does not parse SQL — so the
 * assertions below also pin the statement's structure and paren balance. The
 * real end-to-end check lives in `e2e/tests/admin/users-metadata-api.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { userMetadataPatchSql } from '../user.identify'

function renderPatch(updates: Record<string, unknown>, removals: string[]) {
  return new PgDialect().sqlToQuery(userMetadataPatchSql(updates, removals))
}

/** Rendering does not validate SQL; an unbalanced statement must still fail here. */
function expectBalancedParens(sql: string) {
  const opens = (sql.match(/\(/g) ?? []).length
  const closes = (sql.match(/\)/g) ?? []).length
  expect(closes).toBe(opens)
}

describe('userMetadataPatchSql', () => {
  it('renders an empty removal list as ARRAY[]::text[]', () => {
    const patch = renderPatch({ plan: 'pro' }, [])

    expect(patch.sql).toContain('- ARRAY[]::text[]')
    expect(patch.sql).toMatch(/- ARRAY\[\]::text\[\]\) \|\| \$\d+::jsonb\)::text$/)
    expect(patch.params).toEqual([JSON.stringify({ plan: 'pro' })])
    expect(patch.sql).not.toMatch(/\(\s*\)::text\[\]|\(\$\d+\)::text\[\]/)
    expectBalancedParens(patch.sql)
  })

  it('binds one removed key as a single text[] element', () => {
    const patch = renderPatch({}, ['_externalUserId'])

    expect(patch.sql).toContain('- ARRAY[$1]::text[]')
    expect(patch.params).toEqual(['_externalUserId', '{}'])
    // A flattening regression would put the key in a scalar cast instead.
    expect(patch.params.some(Array.isArray)).toBe(false)
    expectBalancedParens(patch.sql)
  })

  it('binds several removed keys as separate elements, never a flattened list', () => {
    const patch = renderPatch({ plan: 'pro' }, ['plan', '_externalUserId'])

    expect(patch.sql).toContain('- ARRAY[$1, $2]::text[]')
    expect(patch.params).toEqual(['plan', '_externalUserId', JSON.stringify({ plan: 'pro' })])
    expect(patch.sql).not.toMatch(/\(\$\d+(, \$\d+)*\)::text\[\]/)
    expectBalancedParens(patch.sql)
  })

  it('merges the update bag over the remaining metadata atomically', () => {
    const patch = renderPatch({ plan: 'pro' }, [])

    expect(patch.sql).toContain(`coalesce(nullif("user"."metadata", ''), '{}')::jsonb`)
    expect(patch.sql).toMatch(/\|\| \$\d+::jsonb\)::text$/)
    expectBalancedParens(patch.sql)
  })
})
