// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render as renderRTL, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { AgentMessageBubble, VisitorMessageBubble } from '../message-bubble'
import type { AgentConversationMessageDTO } from '@/lib/shared/conversation/types'
import type { TiptapContent } from '@/lib/shared/db-types'
import en from '@/locales/en.json'

function render(ui: React.ReactNode) {
  return renderRTL(ui, {
    wrapper: ({ children }) => (
      <IntlProvider locale="en" messages={en}>
        {children}
      </IntlProvider>
    ),
  })
}

afterEach(cleanup)

function message(content: string, contentJson: TiptapContent | null): AgentConversationMessageDTO {
  return {
    id: 'conversation_msg_1' as never,
    conversationId: 'conversation_1' as never,
    ticketId: null,
    senderType: 'agent',
    content,
    contentJson,
    createdAt: '2026-10-02T10:59:00.000Z',
    author: { principalId: 'principal_1' as never, displayName: 'Quinn', avatarUrl: null },
    attachments: [],
    isInternal: false,
    viaEmail: false,
    systemEvent: null,
    reactions: [],
    flaggedAt: null,
    postSuggestion: null,
  }
}

for (const surface of ['admin', 'widget'] as const) {
  function bubble(content: string, contentJson: TiptapContent | null = null) {
    return render(
      <IntlProvider locale="en" messages={{}}>
        {surface === 'admin' ? (
          <AgentMessageBubble message={message(content, contentJson)} />
        ) : (
          <VisitorMessageBubble content={content} contentJson={contentJson} />
        )}
      </IntlProvider>
    )
  }

  describe(`${surface} message rendering`, () => {
    it('renders the screenshot link as a clickable label', () => {
      const { container } = bubble(
        'For **Quackback Cloud**, AI is included. [Use AI-powered features](https://quackback.io/hc/en/articles/64-ai-features)'
      )
      expect(screen.getByRole('link', { name: 'Use AI-powered features' })).toHaveAttribute(
        'href',
        'https://quackback.io/hc/en/articles/64-ai-features'
      )
      expect(container.querySelector('strong')).toHaveTextContent('Quackback Cloud')
      expect(container.textContent).not.toContain('](https://')
    })

    it('renders headings, nested emphasis, strike, quotes and a list without a blank separator', () => {
      const { container } = bubble(
        '## Setup\nUse **bold and *italic*** or ~~old~~.\n- First\n  - Nested\n\n> A quote'
      )
      expect(screen.getByRole('heading', { level: 2, name: 'Setup' })).toBeInTheDocument()
      expect(container.querySelector('strong em')).toHaveTextContent('italic')
      expect(container.querySelector('del')).toHaveTextContent('old')
      expect(container.querySelector('ul ul li')).toHaveTextContent('Nested')
      expect(container.querySelector('blockquote')).toHaveTextContent('A quote')
    })

    it('preserves the starting number of a resumed Markdown list', () => {
      const { container } = bubble('3. Third\n4. Fourth')
      expect(container.querySelector('ol')).toHaveAttribute('start', '3')
    })

    it('keeps formatting literal inside inline and fenced code', () => {
      const { container } = bubble(
        'Use `**literal** [1]`.\n\n```js\nconst value = "[1]";\n```\n\nRead **the guide**.'
      )
      expect(container.querySelector('p code')).toHaveTextContent('**literal** [1]')
      expect(container.querySelector('pre code')).toHaveTextContent('const value = "[1]";')
    })

    it('renders GFM tables and disabled task checkboxes', () => {
      const { container } = bubble(
        '| Plan | AI |\n| --- | --- |\n| Paid | Included |\n\n- [x] Finished\n- [ ] Pending'
      )
      expect(screen.getByRole('table')).toHaveTextContent('Included')
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
      expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
      expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked()
      expect(container.querySelectorAll('input:disabled')).toHaveLength(2)
    })

    it('renders Markdown-only human replies and autolinks', () => {
      bubble('Read [our guide](https://example.com/guide) or https://example.com/docs.')
      expect(screen.getByRole('link', { name: 'our guide' })).toHaveAttribute(
        'href',
        'https://example.com/guide'
      )
      expect(screen.getByRole('link', { name: 'https://example.com/docs' })).toBeInTheDocument()
    })

    it('keeps relative and fragment links on the serving origin', () => {
      bubble('[Help](/hc/en) [Section](#setup) [Sibling](../guide)')
      expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/hc/en')
      expect(screen.getByRole('link', { name: 'Section' })).toHaveAttribute('href', '#setup')
      expect(screen.getByRole('link', { name: 'Sibling' })).toHaveAttribute('href', '../guide')
    })

    it('does not create executable HTML or links from Markdown', () => {
      const { container } = bubble(
        '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert%281%29) ![bad](data:image/svg+xml;base64,PHN2Zz4=)'
      )
      expect(container.querySelector('script, img, [onerror]')).toBeNull()
      expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument()
      expect(container.textContent).toContain('unsafe')
      expect(container.textContent).toContain('<script>alert(1)</script>')
    })

    it('preserves canonical rich text instead of parsing its plain projection', () => {
      const { container } = bubble('Wrong projection', {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { start: 7 },
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical' }] }],
              },
            ],
          },
        ],
      })
      expect(container.querySelector('ol')).toHaveAttribute('start', '7')
      expect(container.textContent).toContain('Canonical')
      expect(container.textContent).not.toContain('Wrong projection')
    })
  })
}

describe('agent thread markdown', () => {
  it('formats Markdown-only internal notes in the admin thread', () => {
    render(
      <AgentMessageBubble
        message={{
          ...message('Read **this** [guide](https://example.com/guide)', null),
          isInternal: true,
        }}
      />
    )
    expect(screen.getByRole('link', { name: 'guide' })).toHaveAttribute(
      'href',
      'https://example.com/guide'
    )
    expect(screen.getByText('this').tagName).toBe('STRONG')
  })
})
