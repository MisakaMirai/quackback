/**
 * Regression coverage for the 500 on updating an existing user's metadata.
 *
 * Drizzle's `sql` template flattens a JS array into one parameter per element,
 * so interpolating the removals straight into `- ${metadataRemovals}::text[]`
 * rendered `()::text[]` (no removals), `($1)::text[]` (one) or
 * `($1, $2)::text[]` (several) — every one of them invalid Postgres, and a 500
 * on any attribute update of an existing user.
 *
 * The patch is rendered with PgDialect instead of executed: a real database can
 * only report "syntax error", not which parameter shape regressed.
 */
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { userMetadataPatchSql } from '../user.identify'

function renderPatch(updates: Record<string, unknown>, removals: string[]) {
  return new PgDialect().sqlToQuery(userMetadataPatchSql(updates, removals))
}

describe('userMetadataPatchSql', () => {
  it('renders an empty removal list as ARRAY[]::text[]', () => {
    const patch = renderPatch({ plan: 'pro' }, [])

    expect(patch.sql).toContain('- ARRAY[]::text[]')
    expect(patch.params).toEqual([JSON.stringify({ plan: 'pro' })])
    expect(patch.sql).not.toMatch(/\(\s*\)::text\[\]|\(\$\d+\)::text\[\]/)
  })

  it('binds one removed key as a single text[] element', () => {
    const patch = renderPatch({}, ['_externalUserId'])

    expect(patch.sql).toContain('- ARRAY[$1]::text[]')
    expect(patch.params).toEqual(['_externalUserId', '{}'])
    // A flattening regression would put the key in a scalar cast instead.
    expect(patch.params.some(Array.isArray)).toBe(false)
  })

  it('binds several removed keys as separate elements, never a flattened list', () => {
    const patch = renderPatch({ plan: 'pro' }, ['plan', '_externalUserId'])

    expect(patch.sql).toContain('- ARRAY[$1, $2]::text[]')
    expect(patch.params).toEqual(['plan', '_externalUserId', JSON.stringify({ plan: 'pro' })])
    expect(patch.sql).not.toMatch(/\(\$\d+(, \$\d+)*\)::text\[\]/)
  })

  it('merges the update bag over the remaining metadata atomically', () => {
    const patch = renderPatch({ plan: 'pro' }, [])

    expect(patch.sql).toContain(`coalesce(nullif("user"."metadata", ''), '{}')::jsonb`)
    expect(patch.sql).toContain('|| $1::jsonb')
    expect(patch.sql).toMatch(/\)::text$/)
  })
})
