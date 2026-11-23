// @vitest-environment happy-dom
/**
 * The moderation backlog banner is the first place an agent sees held posts.
 * Both its count and its link must come from the catalog — a hardcoded
 * "Review" left the Chinese banner half-English.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const moderationStatus = {
  queryKey: ['admin', 'moderation', 'status'] as const,
  queryFn: async () => ({ pendingCount: 2 }),
}

vi.mock('@/lib/client/queries/admin', () => ({
  adminQueries: { moderationStatus: () => moderationStatus },
}))

const { ModerationPendingBanner } = await import('../moderation-pending-banner')

afterEach(cleanup)

describe('ModerationPendingBanner', () => {
  it('translates both the count and the link in the viewer’s language', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <IntlProvider
          locale="zh-CN"
          messages={{
            'admin.feedback.moderation.pending': '有 {count} 项内容待审核',
            'admin.feedback.moderation.review': '去审核',
          }}
        >
          <ModerationPendingBanner />
        </IntlProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('有 2 项内容待审核')).toBeTruthy()
    expect(screen.getByRole('link', { name: /去审核/ })).toHaveAttribute(
      'href',
      '/admin/feedback/moderation'
    )
  })
})
