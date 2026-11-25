/**
 * Anti-regression gate for the cloud removal.
 *
 * Quackback Cloud's subscription plumbing — billing, plan entitlements, the
 * control-plane client and its projections, hosted usage reporting, the fleet
 * migrator and anonymous telemetry — was removed from this codebase. The
 * products themselves and every self-hosted capability (operator tier limits,
 * audit log, SSO, webhooks, custom domains, config file) stayed.
 *
 * This test fails if any of that plumbing comes back through a rebase or a
 * merge from an upstream that still carries it. It reads source files only, so
 * a reintroduced import is caught before any build step.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { walkSourceFiles } from '../policy/source-files'

const SRC_ROOT = join(__dirname, '../../..')
/** The repository root: this file lives at apps/web/src/lib/server/__tests__. */
const REPO_ROOT = join(__dirname, '../../../../../..')

/** Import paths that must not exist in the tree at all. */
const FORBIDDEN_MODULES = [
  'domains/settings/cloud/',
  'lib/server/control-plane/',
  'lib/server/telemetry/',
  'lib/server/cloud-widget/',
  'lib/server/domains/billing/',
  'lib/shared/billing/',
  'lib/server/fleet/schema-state',
  'lib/server/cloud-residue',
]

/** Call sites that belong to the removed commercial layer. */
const FORBIDDEN_SYMBOLS = [
  'getCloudConfig(',
  'requireEntitlement(',
  'resolveCloudConfig(',
  'isHostedBillingConfigured(',
  'startTelemetry(',
  // The anonymous usage snapshot's kill switch. The snapshot itself is gone, so
  // the switch must not come back with it.
  'DISABLE_TELEMETRY',
  'emitPlgEvent(',
  'recordPlgEvent(',
  // The shared-OAuth gateway: integrations now always use the tenant's own
  // callback origin, so these env vars must not come back.
  'INTEGRATION_OAUTH_GATEWAY_URL',
  'INTEGRATION_GATEWAY_FORWARD_SECRET',
  'verifyGatewayForward(',
  'verifyGatewayReceipt(',
]

function offenders(needles: readonly string[]): string[] {
  const found: string[] = []
  for (const file of walkSourceFiles(SRC_ROOT)) {
    if (file.includes('__tests__') || /\.(test|spec)\./.test(file)) continue
    const relativePath = relative(SRC_ROOT, file).split('\\').join('/')
    const source = readFileSync(file, 'utf8')
    for (const needle of needles) {
      if (source.includes(needle)) found.push(`${relativePath} references ${needle}`)
    }
  }
  return found
}

describe('cloud residue', () => {
  it('has no import of the removed cloud modules', () => {
    expect(offenders(FORBIDDEN_MODULES)).toEqual([])
  })

  it('has no call site of the removed commercial layer', () => {
    expect(offenders(FORBIDDEN_SYMBOLS)).toEqual([])
  })
})

describe('hosted deployment residue', () => {
  it('has no Railway template or CLI dependency', () => {
    expect(existsSync(join(REPO_ROOT, 'deploy/railway-template.yml'))).toBe(false)
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }
    expect(pkg.devDependencies?.railway).toBeUndefined()
    expect(pkg.dependencies?.railway).toBeUndefined()
  })

  it('names Railway nowhere in the docs, env template or source', () => {
    const files = [
      'README.md',
      '.env.example',
      'deploy/README.md',
      'deploy/self-hosted/README.md',
    ].map((file) => join(REPO_ROOT, file))
    const offendersFound = files
      .filter((file) => existsSync(file))
      .filter((file) => readFileSync(file, 'utf8').toLowerCase().includes('railway'))
      .concat(
        walkSourceFiles(SRC_ROOT).filter((file) =>
          readFileSync(file, 'utf8').toLowerCase().includes('railway')
        )
      )
      .map((file) => relative(REPO_ROOT, file).split('\\').join('/'))
    expect(offendersFound).toEqual([])
  })
})
