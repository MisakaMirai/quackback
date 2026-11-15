// @vitest-environment happy-dom
/**
 * VisitorMessageBubble rendering basics: peer attribution, bare self bubbles,
 * and the deep-link anchor.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { VisitorMessageBubble } from '../message-bubble'

afterEach(cleanup)

function renderBubble(props: Parameters<typeof VisitorMessageBubble>[0]) {
  return render(
    <IntlProvider locale="en-US" messages={{}}>
      <VisitorMessageBubble {...props} />
    </IntlProvider>
  )
}

describe('VisitorMessageBubble', () => {
  it('renders the peer attribution name and time', () => {
    renderBubble({
      side: 'peer',
      content: 'Hello there',
      authorName: 'Agent Name',
      time: '10:30 AM',
    })

    expect(screen.getByText('Agent Name · 10:30 AM')).toBeInTheDocument()
  })

  it('leaves a self bubble bare without a selfLabel', () => {
    renderBubble({
      side: 'self',
      content: 'Hi there',
    })

    expect(screen.getByText('Hi there')).toBeInTheDocument()
    expect(screen.queryByText(/10:30 AM/)).not.toBeInTheDocument()
  })

  it('marks its root with data-message-id so "jump to message" can find it', () => {
    const { container } = renderBubble({
      side: 'peer',
      content: 'Hi there',
      messageId: 'conversation_msg_1',
    })
    expect(container.querySelector('[data-message-id="conversation_msg_1"]')).not.toBeNull()
  })
})
