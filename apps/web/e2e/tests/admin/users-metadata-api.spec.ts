import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test'

/**
 * End-to-end coverage for updating metadata on EXISTING portal users.
 *
 * `PATCH /api/v1/users/:principalId` merges attributes into `user.metadata`
 * with one atomic UPDATE. That statement broke twice: Drizzle's `sql` template
 * flattened the removal array into `()::text[]` / `($1)::text[]`, and the
 * first fix dropped a closing paren. Both were 500s on every metadata update of
 * an existing user, while creating one (a plain JSON insert) worked.
 *
 * These tests drive the real chain — a personal API key minted in the UI,
 * authenticated REST calls, the route's SQL against Postgres — and cover:
 * create with attributes, single/multi merge, single/multi removal, typed
 * (number) coercion and rejection, empty-body no-op, profile name, the
 * identify upsert (including case-insensitive email), externalId round trip,
 * list read-back, and the 400/401/404 edges.
 */

import { AUTH_STATE_PATH } from '../../utils/auth-state'

const ADMIN_STATE = AUTH_STATE_PATH

/** Unique per run so repeated runs never collide on attribute keys. */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const PLAN_KEY = `e2e_meta_plan_${RUN}`
const TIER_KEY = `e2e_meta_tier_${RUN}`
const SEATS_KEY = `e2e_meta_seats_${RUN}`

interface UserPayload {
  principalId: string
  email: string
  name?: string
  created?: boolean
  externalId?: string | null
  attributes: Record<string, unknown>
}

interface UserListPayload {
  data: UserPayload[]
}

let apiKey = ''

function authHeaders() {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

async function payloadOf(response: Response): Promise<UserPayload> {
  return ((await response.json()) as { data: UserPayload }).data
}

function uniqueEmail() {
  return `e2e-metadata-${RUN}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

/** Create an attribute definition from Settings → People → Attributes. */
async function createAttributeDefinition(
  page: Page,
  key: string,
  label: string,
  type: 'Text' | 'Number' = 'Text'
) {
  await page.goto('/admin/settings/people')
  await waitForNetworkIdle(page)

  await page
    .getByRole('button', { name: /new attribute/i })
    .first()
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 5000 })
  await dialog.locator('#attr-key').fill(key)
  await dialog.locator('#attr-label').fill(label)

  if (type !== 'Text') {
    await dialog.locator('[role="combobox"]').first().click()
    const options = page
      .locator('[role="listbox"]')
      .or(page.locator('[data-slot="select-content"]'))
    await expect(options.first()).toBeVisible({ timeout: 5000 })
    await options.first().getByText(type, { exact: true }).click()
  }

  await dialog.getByRole('button', { name: /create attribute/i }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })
}

/** Mint a personal key on the signed-in teammate's own API keys page. */
async function createApiKey(page: Page, name: string): Promise<string> {
  await page.goto('/settings/api-keys')
  await waitForNetworkIdle(page)

  await page.getByRole('button', { name: 'New key' }).first().click()
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Create API key' })
  await expect(createDialog).toBeVisible({ timeout: 5000 })
  await createDialog.locator('#personal-key-name').fill(name)
  await createDialog.getByRole('button', { name: 'Create key' }).click()

  // The reveal dialog replaces the create dialog in place.
  const revealDialog = page.getByRole('dialog').filter({ hasText: 'API key created' })
  await expect(revealDialog).toBeVisible({ timeout: 10000 })
  const keyCode = revealDialog.locator('code').filter({ hasText: /^qb_/ })
  await expect(keyCode).toBeVisible()
  const plaintext = (await keyCode.textContent())?.trim() ?? ''
  expect(plaintext).toMatch(/^qb_[0-9a-f]{48}$/)

  await revealDialog.getByRole('button', { name: /i've saved my key/i }).click()
  await expect(revealDialog).toBeHidden({ timeout: 5000 })
  return plaintext
}

/** Create a portal user through the public identify endpoint. */
async function createPortalUser(
  request: APIRequestContext,
  attributes: Record<string, unknown>,
  email = uniqueEmail()
): Promise<UserPayload> {
  const response = await request.post('/api/v1/users/identify', {
    headers: authHeaders(),
    data: { email, name: 'E2E Metadata', attributes },
  })
  expect(response.status()).toBe(201)
  const created = await payloadOf(response)
  expect(created.created).toBe(true)
  return created
}

async function removePortalUser(request: APIRequestContext, principalId: string) {
  const response = await request.delete(`/api/v1/users/${principalId}`, { headers: authHeaders() })
  expect(response.status()).toBe(204)
}

async function getUser(request: APIRequestContext, principalId: string): Promise<UserPayload> {
  const response = await request.get(`/api/v1/users/${principalId}`, { headers: authHeaders() })
  expect(response.status()).toBe(200)
  return payloadOf(response)
}

/** `POST /users/identify` returns the stored metadata, including internal keys. */
async function identifyReadBack(request: APIRequestContext, email: string): Promise<UserPayload> {
  const response = await request.post('/api/v1/users/identify', {
    headers: authHeaders(),
    data: { email },
  })
  expect(response.status()).toBe(200)
  return payloadOf(response)
}

/** A well-formed principal id that cannot exist: flip the last suffix character. */
function unknownPrincipalId(principalId: string): string {
  const last = principalId.slice(-1)
  return principalId.slice(0, -1) + (last === 'a' ? 'b' : 'a')
}

test.describe.configure({ mode: 'serial', timeout: 60_000 })

test.describe('Portal user metadata over the REST API', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE })
    const page = await context.newPage()
    try {
      await createAttributeDefinition(page, PLAN_KEY, 'E2E Plan')
      await createAttributeDefinition(page, TIER_KEY, 'E2E Tier')
      await createAttributeDefinition(page, SEATS_KEY, 'E2E Seats', 'Number')
      apiKey = await createApiKey(page, `E2E metadata ${RUN}`)
    } finally {
      await context.close()
    }
  })

  test('identify creates a user with attributes', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    try {
      expect(created.attributes).toMatchObject({ [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH updates one attribute on an existing user', async ({ request }) => {
    // The 500 regression: an existing user's metadata update used to render
    // `- ()::text[]`, then a syntactically unbalanced statement.
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [PLAN_KEY]: 'pro' } },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes[PLAN_KEY]).toBe('pro')

      // The merge really landed in the row, not only in the response.
      const read = await getUser(request, created.principalId)
      expect(read.attributes).toMatchObject({ [PLAN_KEY]: 'pro', [TIER_KEY]: 'basic' })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH merges several attributes in one update', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [PLAN_KEY]: 'pro', [TIER_KEY]: 'gold' } },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes).toMatchObject({
        [PLAN_KEY]: 'pro',
        [TIER_KEY]: 'gold',
      })

      const read = await getUser(request, created.principalId)
      expect(read.attributes).toMatchObject({ [PLAN_KEY]: 'pro', [TIER_KEY]: 'gold' })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH removes one attribute and keeps the others', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [PLAN_KEY]: null } },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes).not.toHaveProperty(PLAN_KEY)

      const read = await getUser(request, created.principalId)
      expect(read.attributes).not.toHaveProperty(PLAN_KEY)
      expect(read.attributes[TIER_KEY]).toBe('basic')
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH removes several attributes in one update', async ({ request }) => {
    // One text[] element per removed key: `ARRAY[$1, $2]`.
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [PLAN_KEY]: null, [TIER_KEY]: null } },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes).toEqual({})

      expect((await getUser(request, created.principalId)).attributes).toEqual({})
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('number attributes coerce on write and read back as numbers', async ({ request }) => {
    const created = await createPortalUser(request, { [SEATS_KEY]: '42' })
    try {
      // `'42'` is stored as the JSON number 42, not the string.
      expect(created.attributes[SEATS_KEY]).toBe(42)

      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [SEATS_KEY]: '7' } },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes[SEATS_KEY]).toBe(7)

      expect((await getUser(request, created.principalId)).attributes[SEATS_KEY]).toBe(7)
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH rejects a number that cannot be coerced', async ({ request }) => {
    const created = await createPortalUser(request, { [SEATS_KEY]: '42' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [SEATS_KEY]: 'not-a-number' } },
      })
      expect(response.status()).toBe(400)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR'
      )

      // A rejected value must not partially write.
      expect((await getUser(request, created.principalId)).attributes[SEATS_KEY]).toBe(42)
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH with an empty body is a no-op', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free', [TIER_KEY]: 'basic' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: {},
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).attributes).toMatchObject({
        [PLAN_KEY]: 'free',
        [TIER_KEY]: 'basic',
      })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH updates the profile name and keeps attributes', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    try {
      const name = `Renamed ${RUN}`
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { name },
      })
      expect(response.status()).toBe(200)
      expect((await payloadOf(response)).name).toBe(name)

      const read = await getUser(request, created.principalId)
      expect(read.name).toBe(name)
      expect(read.attributes[PLAN_KEY]).toBe('free')
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('identify upserts attributes on an existing user', async ({ request }) => {
    // The upsert path runs the same metadata patch as PATCH.
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    try {
      const response = await request.post('/api/v1/users/identify', {
        headers: authHeaders(),
        data: { email: created.email, attributes: { [TIER_KEY]: 'pro' } },
      })
      expect(response.status()).toBe(200)
      const updated = await payloadOf(response)
      expect(updated.created).toBe(false)
      expect(updated.attributes).toMatchObject({ [PLAN_KEY]: 'free', [TIER_KEY]: 'pro' })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('identify matches an existing user case-insensitively', async ({ request }) => {
    // Emails are normalized to lowercase on the way in, so the mixed-case
    // address must find the same row instead of creating a second user.
    const email = `E2E-Case-${RUN}@Example.com`
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' }, email)
    try {
      const response = await request.post('/api/v1/users/identify', {
        headers: authHeaders(),
        data: { email: email.toLowerCase(), attributes: { [TIER_KEY]: 'gold' } },
      })
      expect(response.status()).toBe(200)
      const updated = await payloadOf(response)
      expect(updated.created).toBe(false)
      expect(updated.principalId).toBe(created.principalId)
      expect(updated.attributes).toMatchObject({ [PLAN_KEY]: 'free', [TIER_KEY]: 'gold' })
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH sets and clears externalId without losing attributes', async ({ request }) => {
    // `_externalUserId` shares the metadata column with attributes.
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    const externalId = `ext-${RUN}`
    try {
      const linked = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { externalId },
      })
      expect(linked.status()).toBe(200)
      expect((await payloadOf(linked)).externalId).toBe(externalId)

      // GET omits externalId, so read it back through identify.
      const linkedRead = await identifyReadBack(request, created.email)
      expect(linkedRead.externalId).toBe(externalId)
      expect(linkedRead.attributes[PLAN_KEY]).toBe('free')

      // An attribute merge must not drop the internal `_`-prefixed key.
      const attributeUpdate = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [PLAN_KEY]: 'pro' } },
      })
      expect(attributeUpdate.status()).toBe(200)
      const afterAttributeUpdate = await identifyReadBack(request, created.email)
      expect(afterAttributeUpdate.externalId).toBe(externalId)
      expect(afterAttributeUpdate.attributes[PLAN_KEY]).toBe('pro')

      const unlinked = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { externalId: null },
      })
      expect(unlinked.status()).toBe(200)
      expect((await payloadOf(unlinked)).externalId).toBeNull()

      const unlinkedRead = await identifyReadBack(request, created.email)
      expect(unlinkedRead.externalId).toBeNull()
      expect(unlinkedRead.attributes[PLAN_KEY]).toBe('pro')
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('GET /users lists the stored attributes', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'pro' })
    try {
      const response = await request.get(
        `/api/v1/users?search=${encodeURIComponent(created.email)}`,
        { headers: authHeaders() }
      )
      expect(response.status()).toBe(200)
      const list = (await response.json()) as UserListPayload
      const row = list.data.find((u) => u.principalId === created.principalId)
      expect(row).toBeTruthy()
      expect(row?.attributes[PLAN_KEY]).toBe('pro')
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH rejects an undefined attribute with 400, not 500', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    try {
      const response = await request.patch(`/api/v1/users/${created.principalId}`, {
        headers: authHeaders(),
        data: { attributes: { [`e2e_undefined_${RUN}`]: 'x' } },
      })
      expect(response.status()).toBe(400)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')

      // The rejected update changed nothing.
      const read = await getUser(request, created.principalId)
      expect(read.attributes[PLAN_KEY]).toBe('free')
      expect(Object.keys(read.attributes)).toEqual([PLAN_KEY])
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })

  test('PATCH and GET require an API key', async ({ request }) => {
    const getResponse = await request.get('/api/v1/users')
    expect(getResponse.status()).toBe(401)
    // `withApiKeyAuth` throws API_UNAUTHORIZED; the route maps it to the
    // generic UNAUTHORIZED envelope so clients branch on one code.
    expect(((await getResponse.json()) as { error: { code: string } }).error.code).toBe(
      'UNAUTHORIZED'
    )

    const patchResponse = await request.patch(
      '/api/v1/users/principal_00000000000000000000000000',
      {
        data: { name: 'Anonymous' },
      }
    )
    expect(patchResponse.status()).toBe(401)
  })

  test('PATCH returns 404 for a principal that does not exist', async ({ request }) => {
    const created = await createPortalUser(request, { [PLAN_KEY]: 'free' })
    try {
      const response = await request.patch(
        `/api/v1/users/${unknownPrincipalId(created.principalId)}`,
        { headers: authHeaders(), data: { attributes: { [PLAN_KEY]: 'pro' } } }
      )
      expect(response.status()).toBe(404)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND')
    } finally {
      await removePortalUser(request, created.principalId)
    }
  })
})
