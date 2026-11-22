/**
 * Which slug a sender is minting an inbound address under.
 *
 * `conversation.email-channel.ts` owns what a mail slug IS — the character set,
 * the length the local-part budget leaves it, and the refusal to mint an address
 * without one. This module owns the other half of the same question: where a
 * sender gets the slug from.
 *
 * ## Self-hosted: there is no registry, so there is nothing to look up
 *
 * One install owns its whole inbound domain, so the label in a local part
 * distinguishes nothing and only has to be a label its own mail routing already
 * delivers. {@link SELF_HOSTED_MAIL_SLUG} is that label. A scope may still
 * carry a slug, which the test fixture uses; production never creates one.
 */
import { getCurrentWorkspace } from '@/lib/server/workspaces/workspace-context'

/**
 * The label a self-hosted install mints under.
 *
 * `reply` rather than a configurable value, because it is the label the grammar
 * hard-coded into every address it minted before a fleet existed: an install's
 * MX rule, forwarding address or polled mailbox is already the one that receives
 * `reply@<inbound domain>`, and sub-addressed mail for `reply+…@` lands in the
 * same place. Any other constant would silently stop reply-by-email working on
 * installs that changed nothing, and a config key would hand every self-hoster a
 * decision they have never had to make in order to keep what they already have.
 *
 * It is a legal slug under the shared grammar (lower-case, five characters), so
 * an address minted here parses and verifies through exactly the same path as a
 * fleet one. See the parity assertion in this module's tests.
 */
export const SELF_HOSTED_MAIL_SLUG = 'reply'

/**
 * The mail slug to mint under.
 *
 * A scope may carry one; production never creates a scope, so an install mints
 * under {@link SELF_HOSTED_MAIL_SLUG}. The scope branch is kept because the
 * test fixture opens one to exercise mail routing.
 */
export function currentMailSlug(): string | null {
  const workspace = getCurrentWorkspace()
  if (workspace) return workspace.email.mailSlug
  return SELF_HOSTED_MAIL_SLUG
}
