/**
 * Customer-context adapters (IF WO-9): each provider maps its native contact
 * shape onto the normalized EnrichmentCard the generic panel renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => vi.clearAllMocks())

vi.mock('@/integrations/hubspot/server/context', () => ({ searchHubSpotContact: vi.fn() }))
vi.mock('@/integrations/intercom/server/context', () => ({ searchContact: vi.fn() }))

import { hubspotContext } from '@/integrations/hubspot/server/enrichment'
import { intercomContext } from '@/integrations/intercom/server/enrichment'
import { searchHubSpotContact } from '@/integrations/hubspot/server/context'
import { searchContact } from '@/integrations/intercom/server/context'

describe('hubspotContext', () => {
  it('maps name/company/deal value onto the card', async () => {
    vi.mocked(searchHubSpotContact).mockResolvedValue({
      id: '99',
      email: 'ada@acme.co',
      firstName: 'Ada',
      lastName: 'Lovelace',
      company: 'Acme',
      lifecycleStage: 'customer',
      totalDealValue: 12000,
      deals: [{ id: 'd1', name: 'Enterprise', stage: 'won', amount: 12000 }],
    })
    const card = await hubspotContext({ accessToken: 't', config: {}, email: 'ada@acme.co' })
    expect(card).toMatchObject({ provider: 'hubspot', name: 'Ada Lovelace', company: 'Acme' })
    expect(card!.url).toBe('https://app.hubspot.com/contacts/contact/99')
    expect(card!.fields).toEqual([
      { label: 'Lifecycle', value: 'customer' },
      { label: 'Deal value', value: '$12,000' },
      { label: 'Open deals', value: '1' },
    ])
  })
})

describe('intercomContext', () => {
  it('maps name/company/plan onto the card', async () => {
    vi.mocked(searchContact).mockResolvedValue({
      id: 'c1',
      name: 'Ada',
      email: 'ada@acme.co',
      company: { id: 'o1', name: 'Acme' },
      customAttributes: { plan: 'Pro' },
      tags: ['trial'],
    })
    const card = await intercomContext({ accessToken: 't', config: {}, email: 'ada@acme.co' })
    expect(card).toMatchObject({ provider: 'intercom', name: 'Ada', company: 'Acme' })
    expect(card!.fields).toEqual([
      { label: 'Plan', value: 'Pro' },
      { label: 'Tags', value: 'trial' },
    ])
  })
})
