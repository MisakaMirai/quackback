/**
 * Where a sender gets the slug it mints an address under.
 *
 * The grammar's own suite proves what a slugged address is. This one proves the
 * seam either side of it: the install mints on one fixed label, and an address
 * made from it verifies back to the same conversation.
 *
 * The assertions run the real minters rather than inspecting the slug alone,
 * because "the accessor returned a string" is not the property. The property is
 * that the string reaches a customer's mail client as an address that verifies
 * back to the same conversation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationId, TicketId } from '@quackback/ids'
import {
  conversationIdFromInboundAddress,
  inboundReplyToAddress,
  inboundTicketReplyToAddress,
  isValidMailSlug,
  ticketIdFromInboundAddress,
  workspaceSlugFromInboundAddress,
} from '../conversation.email-channel'
import { SELF_HOSTED_MAIL_SLUG, currentMailSlug } from '../conversation.mail-slug'

const ENV = {
  EMAIL_INBOUND_DOMAIN: 'quackback.co.uk',
  EMAIL_INBOUND_SIGNING_SECRET: 'whsec_dGVzdHNlY3JldA==',
}

const CONVERSATION_ID = 'conversation_01kw8qxn1eeh4t2rek7varh032' as ConversationId
const TICKET_ID = 'ticket_01h455vb4pex5vsknk084sn02q' as TicketId

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('currentMailSlug', () => {
  it('is the self-hosted label', () => {
    expect(currentMailSlug()).toBe(SELF_HOSTED_MAIL_SLUG)
  })

  it('mints a label the grammar accepts, so the path is not a special case', () => {
    expect(isValidMailSlug(SELF_HOSTED_MAIL_SLUG)).toBe(true)
  })
})

describe('minting', () => {
  it('carries the label into a conversation address that verifies back', () => {
    const address = inboundReplyToAddress(CONVERSATION_ID, currentMailSlug(), ENV)
    expect(address).not.toBeNull()
    expect(workspaceSlugFromInboundAddress(address!)).toEqual({
      kind: 'slug',
      slug: SELF_HOSTED_MAIL_SLUG,
    })
    expect(conversationIdFromInboundAddress(address!, ENV)).toBe(CONVERSATION_ID)
  })

  it('carries it into a ticket address too', () => {
    const address = inboundTicketReplyToAddress(TICKET_ID, currentMailSlug(), ENV)
    expect(address).not.toBeNull()
    expect(ticketIdFromInboundAddress(address!, ENV)).toBe(TICKET_ID)
  })

  it('a relabelled address does not verify', () => {
    const address = inboundReplyToAddress(CONVERSATION_ID, currentMailSlug(), ENV)!
    const relabelled = address.replace(SELF_HOSTED_MAIL_SLUG, 'ws-other')
    expect(conversationIdFromInboundAddress(relabelled, ENV)).toBeNull()
  })

  it('an install still gets a routable address on the self-hosted label', () => {
    // `reply` is the label the grammar hard-coded, so an install that changed
    // nothing keeps receiving on the address it already routes. A regression
    // here is reply-by-email silently ending for every self-hoster on upgrade.
    const address = inboundReplyToAddress(CONVERSATION_ID, currentMailSlug(), ENV)
    expect(address).toMatch(
      /^reply\+c01kw8qxn1eeh4t2rek7varh032\.[A-Za-z0-9_-]{22}@quackback\.co\.uk$/
    )
    expect(conversationIdFromInboundAddress(address!, ENV)).toBe(CONVERSATION_ID)
    expect(
      ticketIdFromInboundAddress(
        inboundTicketReplyToAddress(TICKET_ID, currentMailSlug(), ENV)!,
        ENV
      )
    ).toBe(TICKET_ID)
  })
})
