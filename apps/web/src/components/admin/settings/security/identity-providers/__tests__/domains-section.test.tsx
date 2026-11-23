// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityProvider } from '@/lib/server/domains/settings/identity-providers.service'
import type { VerifiedDomain } from '@/lib/server/domains/settings/settings.types'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/lib/server/functions/sso', () => ({
  addProviderDomainFn: vi.fn(),
  verifyProviderDomainFn: vi.fn(),
  setDomainEnforcedFn: vi.fn(),
  removeVerifiedDomainFn: vi.fn(),
}))

const { DomainsSection } = await import('../domains-section')

function domain(id: string, name: string, verified: boolean): VerifiedDomain {
  return {
    id: `domain_${id}`,
    name,
    verificationToken: `tok-${id}`,
    verifiedAt: verified ? '2026-06-01T00:00:00.000Z' : null,
    enforced: false,
    providerId: 'idp_x' as `idp_${string}`,
    createdAt: '2026-05-01T00:00:00.000Z',
  }
}

function renderSection(domains: VerifiedDomain[]) {
  const provider = { id: 'idp_x', domains } as unknown as IdentityProvider
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <DomainsSection provider={provider} disabled={false} />
    </QueryClientProvider>
  )
}

describe('<DomainsSection>', () => {
  it('shows the TXT record for a pending domain', async () => {
    renderSection([domain('a', 'acme.com', false), domain('b', 'example.org', false)])

    expect(screen.getAllByText(/tok-a/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/tok-b/).length).toBeGreaterThan(0)
    expect(screen.getByText('Add this record to acme.com, then click Verify.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Verify' })).toHaveLength(2)
  })

  it('suggests a neutral domain in the add field', () => {
    renderSection([])
    expect(screen.getByPlaceholderText('example.com')).toBeInTheDocument()
  })

  it('says Pending for a domain still waiting for its record', async () => {
    renderSection([domain('a', 'acme.com', false)])

    expect(await screen.findByText('Pending')).toBeInTheDocument()
    expect(screen.queryByText('Pending verification')).not.toBeInTheDocument()
  })
})

describe('ssoTxtRecord', () => {
  const pending = domain('a', 'acme.com', false)

  it('asks for the verify TXT and waits until Verify fails', async () => {
    const { ssoTxtRecord } = await import('../domains-section')
    expect(ssoTxtRecord(pending, null)).toEqual({
      label: 'Verification',
      type: 'TXT',
      name: '_quackback-verify',
      value: 'qb-domain-verify=tok-a',
      state: 'waiting',
    })
  })

  it('carries the reason Verify failed as its problem sentence', async () => {
    const { ssoTxtRecord } = await import('../domains-section')
    const record = ssoTxtRecord(pending, { verified: false, reason: 'mismatch' })
    expect(record.state).toBe('problem')
    expect(record.problem).toMatch(/didn't match/)
  })
})
