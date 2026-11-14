// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'
import { afterEach, expect, it, vi } from 'vitest'
import en from '@/locales/en.json'
import zhCn from '@/locales/zh-cn.json'
import zhTw from '@/locales/zh-tw.json'

vi.mock('@/lib/server/functions/activation', () => ({
  markPublicBoardLinkCopiedFn: vi.fn(),
}))
vi.mock('@/lib/client/plg-events', () => ({ recordPlgEvent: vi.fn() }))

import { ActivationActionButton } from '../activation-action-button'

afterEach(cleanup)

it('labels the board link action in the viewer language', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IntlProvider locale="zh-cn" messages={zhCn}>
        <ActivationActionButton
          action={{
            id: 'copy-board-link',
            outcome: 'product_feedback',
            label: 'Copy board link',
            kind: 'copy',
            payload: { boardId: 'board_1', path: '/?board=feedback' },
          }}
          surface="launch_plan"
        />
      </IntlProvider>
    </QueryClientProvider>
  )
  expect(screen.getByRole('button', { name: '复制看板链接' })).toBeInTheDocument()
})

it('names Changelog and the Help menu What’s new apart in every language', () => {
  for (const messages of [en, zhCn, zhTw]) {
    const catalogue = messages as Record<string, string>
    expect(catalogue['admin.nav.changelog']).not.toBe(catalogue['admin.help.whatsNew'])
  }
})
