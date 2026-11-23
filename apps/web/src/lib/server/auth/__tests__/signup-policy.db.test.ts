/**
 * `openSignup`, decided against real Postgres.
 *
 * Everything this policy consults is a row: whether a user already holds the
 * address, whether an invitation names it, whether anybody owns setup, and
 * whether a control plane stamped this database. A hand-rolled db double
 * answers all four from one stub and therefore cannot tell them apart — which
 * is the whole seam a signup bypass would hide in, since three of the four are
 * exemptions. So the queries run for real and only `getWorkspaceSettings` is
 * supplied, because the setting is a scalar input to the decision rather than a
 * behaviour a double could get wrong.
 *
 * Every case asks the PORTAL door, the one all three of the policy's callers
 * are. The exemptions are facts about an address rather than about a door, so
 * they hold whichever is asked; the two doors' own divergence, and the stored
 * field each reads, is `signup-policy-audience.db.test.ts`.
 *
 * Two workspace shapes, deliberately unalike, because a fixture set where every
 * workspace looks the same is exactly what hid this:
 *
 *  - PROVISIONED — a `settings` row carrying the control plane's stamp. Its
 *    owner is decided where it was created, so nobody arriving here is it.
 *  - SELF-HOSTED — a `settings` row with no stamp. Its first human genuinely is
 *    the owner, and that path must not regress.
 *
 * The stamp column is a schema-currency PROBE, never a DDL statement this file
 * runs. It ships in migration 0258, so a database that has it is simply a
 * migrated one; asking for it in the probe means the suite either exercises the
 * REAL `to_jsonb(s) ->> 'cloud_workspace_key'` read or skips, and never
 * substitutes something else for it. It must not be added from inside the
 * fixture's transaction: `ALTER TABLE` takes ACCESS EXCLUSIVE on `settings` and
 * holds it until rollback, which is the whole test, so two suites doing it at
 * once deadlock each other. The second provisioned case needs no schema at all:
 * it stamps the metadata bag, the stamp's original home.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { settings, principal, user, invitation, sql, DEFAULT_SETUP_STATE } from '@/lib/server/db'
import { finishIdentityOnboarding } from '@/lib/server/setup-state'
import { mergeSetupState } from '@/lib/server/config-file/reconciler'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const hoisted = vi.hoisted(() => ({ getWorkspaceSettings: vi.fn() }))
vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  getWorkspaceSettings: hoisted.getWorkspaceSettings,
}))

// The real lookup, watched, so a test can tell whether the gate asked it.
vi.mock('@/lib/server/domains/principals/bootstrap-admin', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/server/domains/principals/bootstrap-admin')>()
  return { ...actual, findSetupClaimant: vi.fn(actual.findSetupClaimant) }
})

const { isAccountCreationAllowed } = await import('../signup-policy')
const { findSetupClaimant } = await import('@/lib/server/domains/principals/bootstrap-admin')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: settings.id }).from(settings).limit(0)
    await db.select({ id: invitation.id }).from(invitation).limit(0)
    await db.select({ id: principal.id }).from(principal).limit(0)
    // Migration 0258's column. Probed, not created — see the header.
    await db.execute(sql`select cloud_workspace_key from settings limit 0`)
  },
})

async function seedSettings(
  opts: {
    stamp?: string
    metadataStamp?: string
    setupState?: string
    setupComplete?: boolean
  } = {}
): Promise<void> {
  await testDb.insert(settings).values({
    id: createId('workspace'),
    name: 'Acme',
    slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date(),
    setupState:
      opts.setupState ??
      (opts.setupComplete
        ? JSON.stringify(
            finishIdentityOnboarding(
              {
                ...DEFAULT_SETUP_STATE,
                steps: { ...DEFAULT_SETUP_STATE.steps, workspace: true },
              },
              'product_feedback'
            )
          )
        : null),
    metadata: opts.metadataStamp
      ? JSON.stringify({ cloudTenant: { v: 1, workspaceKey: opts.metadataStamp, stampedAt: '' } })
      : null,
  })
  if (opts.stamp) {
    await testDb.execute(sql`UPDATE settings SET cloud_workspace_key = ${opts.stamp}`)
  }
}

async function seedUser(email: string): Promise<UserId> {
  const id = createId('user') as UserId
  await testDb.insert(user).values({
    id,
    name: email.split('@')[0],
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

/** An account as sign-up leaves it, or a widget visitor's anonymous one. */
async function seedAccount(email: string, type: 'user' | 'anonymous' = 'user'): Promise<void> {
  const userId = await seedUser(email)
  await testDb.insert(principal).values({
    id: createId('principal') as PrincipalId,
    userId,
    role: 'user',
    type,
    createdAt: new Date(),
  })
}

async function seedAdmin(email: string): Promise<void> {
  const userId = await seedUser(email)
  await testDb.insert(principal).values({
    id: createId('principal') as PrincipalId,
    userId,
    role: 'admin',
    type: 'user',
    createdAt: new Date(),
  })
}

/** A workspace whose admin has said "no self-service accounts". */
const CLOSED = { authConfig: { openSignup: false } }
const OPEN = { authConfig: { openSignup: true } }

describe.skipIf(!fixture.available)('isAccountCreationAllowed', () => {
  beforeEach(async () => {
    await fixture.begin()
    vi.clearAllMocks()
    hoisted.getWorkspaceSettings.mockResolvedValue(CLOSED)
  })
  afterEach(fixture.rollback)
  afterAll(fixture.close)

  /**
   * A private portal that grants a whole email domain.
   *
   * `portal-access.ts` will only honour that grant for an authenticated account
   * with a verified address — and this gate is what stands between the person
   * and the account. Without the exemption the grant is unreachable by anyone
   * it names: the admin listed the domain, and nobody at it can obtain the
   * account the listing is about.
   */
  describe('a portal that grants a domain', () => {
    const GRANTS_ACME = {
      authConfig: { openSignup: false },
      portalConfig: {
        access: {
          visibility: 'private',
          allowedDomains: ['acme.example'],

          allowedSegmentIds: [],
        },
      },
    }

    it('lets somebody at the granted domain open the account the grant is about', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(GRANTS_ACME)
      await seedSettings({ setupComplete: true })
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('newperson@acme.example', 'portal')).toBe(true)
    })

    // The control that proves the list is being read rather than the branch
    // being taken for everyone: one character different in the domain.
    it('still refuses somebody at a domain nobody granted', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(GRANTS_ACME)
      await seedSettings({ setupComplete: true })
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('stranger@acme.example.evil', 'portal')).toBe(false)
      expect(await isAccountCreationAllowed('stranger@evil.example', 'portal')).toBe(false)
    })

    // A subdomain is a different domain. `portal-access.ts` compares the whole
    // host with `includes`, and an exemption that matched more broadly than the
    // grant would admit people the grant does not.
    it('does not extend the grant to a subdomain of it', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(GRANTS_ACME)
      await seedSettings({ setupComplete: true })
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('stranger@mail.acme.example', 'portal')).toBe(false)
    })

    it('matches the domain whatever case either side was written in', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue({
        ...GRANTS_ACME,
        portalConfig: {
          access: { ...GRANTS_ACME.portalConfig.access, allowedDomains: ['Acme.Example'] },
        },
      })
      await seedSettings({ setupComplete: true })
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('NewPerson@ACME.example', 'portal')).toBe(true)
    })

    // An empty list is not a grant to everyone.
    it('grants nothing when the list is empty', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue({
        ...GRANTS_ACME,
        portalConfig: {
          access: { ...GRANTS_ACME.portalConfig.access, allowedDomains: [] },
        },
      })
      await seedSettings({ setupComplete: true })
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('anyone@acme.example', 'portal')).toBe(false)
    })
  })

  describe('a self-hosted install', () => {
    // The product's normal install: nobody has signed up yet, and the config
    // file may already have written a settings row whose absent authConfig
    // parses as openSignup:false. Refusing here would leave a workspace that
    // can never be set up.
    it('lets the very first user create an account with sign-ups closed', async () => {
      await seedSettings()

      expect(await isAccountCreationAllowed('first@acme.example', 'portal')).toBe(true)
    })

    it('lets the first user in when there is no settings row at all', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(null)

      expect(await isAccountCreationAllowed('first@acme.example', 'portal')).toBe(true)
    })

    // Once somebody owns it, the setting is a statement an admin actually made,
    // and it is enforced.
    it('closes to strangers as soon as it has an admin', async () => {
      await seedSettings()
      await seedAdmin('owner@acme.example')

      expect(await isAccountCreationAllowed('stranger@evil.example', 'portal')).toBe(false)
    })

    // A service principal is not a human owner — the same rule the bootstrap
    // promoter uses — so it must not close the door on the first real person.
    it('is still open to its first human when only a service admin exists', async () => {
      await seedSettings()
      await testDb.insert(principal).values({
        id: createId('principal') as PrincipalId,
        userId: null,
        role: 'admin',
        type: 'service',
        createdAt: new Date(),
      })

      expect(await isAccountCreationAllowed('first@acme.example', 'portal')).toBe(true)
    })

    // A finished install whose human admins are gone is not waiting for a
    // first user. Its closed setting stands, as the workspace step would
    // refuse the claim anyway.
    it('keeps sign-ups closed on a finished install with only a service admin', async () => {
      await seedSettings({
        setupState: JSON.stringify(
          finishIdentityOnboarding(
            { ...DEFAULT_SETUP_STATE, steps: { ...DEFAULT_SETUP_STATE.steps, workspace: true } },
            'product_feedback'
          )
        ),
      })
      await testDb.insert(principal).values({
        id: createId('principal') as PrincipalId,
        userId: null,
        role: 'admin',
        type: 'service',
        createdAt: new Date(),
      })

      expect(await isAccountCreationAllowed('stranger@evil.example', 'portal')).toBe(false)
    })

    // The first account created while setup is open claims it. Nothing but
    // the wizard is reachable yet, so nobody else needs an account, and one
    // made now could only be a second claim on the install.
    it('takes no second account once the first has claimed setup', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(null)
      await seedAccount('owner@acme.example')

      expect(await isAccountCreationAllowed('second@elsewhere.example', 'portal')).toBe(false)
    })

    it('takes no second account while setup is claimed, even with sign-ups open', async () => {
      await seedSettings()
      hoisted.getWorkspaceSettings.mockResolvedValue({ ...OPEN, settings: { setupState: null } })
      await seedAccount('owner@acme.example')

      expect(await isAccountCreationAllowed('second@elsewhere.example', 'portal')).toBe(false)
      expect(findSetupClaimant).toHaveBeenCalled()
    })

    it('still lets the account that claimed setup sign back in', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(null)
      await seedAccount('owner@acme.example')

      expect(await isAccountCreationAllowed('owner@acme.example', 'portal')).toBe(true)
    })

    it('is not closed by an anonymous visitor who arrived first', async () => {
      hoisted.getWorkspaceSettings.mockResolvedValue(null)
      await seedAccount('temp-visitor@anon.quackback.io', 'anonymous')

      expect(await isAccountCreationAllowed('first@acme.example', 'portal')).toBe(true)
    })

    // A workspace the config file stamped complete has a live portal, so its
    // accounts are customers and its own signup setting governs.
    it('keeps a workspace stamped complete open to sign-ups it allows', async () => {
      await seedSettings({
        setupState: JSON.stringify(
          mergeSetupState(null, { name: 'Acme', onboardingComplete: true })
        ),
      })
      hoisted.getWorkspaceSettings.mockResolvedValue(OPEN)
      await seedAccount('customer@elsewhere.example')

      expect(await isAccountCreationAllowed('another@elsewhere.example', 'portal')).toBe(true)
    })

    // The operator's way out of a stranded install: SETUP_OWNER_EMAIL names
    // whose setup it is, and only that address may create an account until
    // setup is finished.
    describe('with a named setup owner', () => {
      beforeEach(() => {
        process.env.SETUP_OWNER_EMAIL = 'Owner@Acme.Example'
        hoisted.getWorkspaceSettings.mockResolvedValue(null)
      })
      afterEach(() => {
        delete process.env.SETUP_OWNER_EMAIL
      })

      it('lets the named address create its account after another claimed setup', async () => {
        await seedAccount('smoke-test@elsewhere.example')

        expect(await isAccountCreationAllowed('owner@acme.example', 'portal')).toBe(true)
      })

      it('takes no account from anyone else, first or not', async () => {
        expect(await isAccountCreationAllowed('first@elsewhere.example', 'portal')).toBe(false)

        await seedAccount('smoke-test@elsewhere.example')
        expect(await isAccountCreationAllowed('second@elsewhere.example', 'portal')).toBe(false)
      })

      it('still lets an existing account sign in', async () => {
        await seedAccount('smoke-test@elsewhere.example')

        expect(await isAccountCreationAllowed('smoke-test@elsewhere.example', 'portal')).toBe(true)
      })

      // Read on every workspace a process serves, so it must not open one a
      // control plane created.
    })

    // Every portal email sign-in asks this gate, and a finished install is the
    // steady state. Its cached settings already say setup is done, which is
    // the one state in which nobody can hold a setup claim.
    describe('once setup is complete', () => {
      const finished = JSON.stringify(
        finishIdentityOnboarding(
          { ...DEFAULT_SETUP_STATE, steps: { ...DEFAULT_SETUP_STATE.steps, workspace: true } },
          'product_feedback'
        )
      )

      it('does not look for a setup claim', async () => {
        await seedSettings({ setupState: finished })
        await seedAdmin('owner@acme.example')
        hoisted.getWorkspaceSettings.mockResolvedValue({
          ...OPEN,
          settings: { setupState: finished },
        })

        expect(await isAccountCreationAllowed('customer@elsewhere.example', 'portal')).toBe(true)
        expect(findSetupClaimant).not.toHaveBeenCalled()
      })

      it('still refuses by its own setting, without looking for a setup claim', async () => {
        await seedSettings({ setupState: finished })
        await seedAdmin('owner@acme.example')
        hoisted.getWorkspaceSettings.mockResolvedValue({
          ...CLOSED,
          settings: { setupState: finished },
        })

        expect(await isAccountCreationAllowed('stranger@evil.example', 'portal')).toBe(false)
        expect(findSetupClaimant).not.toHaveBeenCalled()
      })
    })

    it('lets an existing account sign in on a closed workspace', async () => {
      await seedSettings()
      await seedAdmin('owner@acme.example')
      await seedUser('regular@acme.example')

      expect(await isAccountCreationAllowed('regular@acme.example', 'portal')).toBe(true)
    })
  })
})
