// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Webhook } from '@/lib/shared/types'

vi.mock('../create-webhook-dialog', () => ({
  CreateWebhookDialog: ({ open }: { open: boolean }) => (open ? <p>Create webhook form</p> : null),
}))
vi.mock('../edit-webhook-dialog', () => ({
  EditWebhookDialog: ({ webhook }: { webhook: Webhook }) => <p>Editing {webhook.url}</p>,
}))
vi.mock('../delete-webhook-dialog', () => ({
  DeleteWebhookDialog: ({ webhook }: { webhook: Webhook }) => <p>Deleting {webhook.url}</p>,
}))

const { WebhooksSettings } = await import('../webhooks-settings')

afterEach(cleanup)

const hook = {
  id: 'webhook_1',
  url: 'https://example.com/hook',
  events: ['post.created'],
  boardIds: null,
  status: 'active',
  failureCount: 0,
  lastError: null,
  lastTriggeredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: 'principal_1',
} as unknown as Webhook

describe('WebhooksSettings', () => {
  it('opens the create form', () => {
    render(<WebhooksSettings webhooks={[]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'New webhook' })[0])
    expect(screen.getByText('Create webhook form')).toBeTruthy()
  })

  it('titles the card "Webhooks" and keeps Edit and Delete in the row menu', async () => {
    const user = userEvent.setup()
    render(<WebhooksSettings webhooks={[hook]} />)
    expect(screen.getByRole('heading', { name: 'Webhooks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete webhook https/ })).toBeNull()
    await user.click(
      screen.getByRole('button', { name: /Actions for https:\/\/example.com\/hook/ })
    )
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.getByText('Editing https://example.com/hook')).toBeInTheDocument()
  })

  it('opens the delete confirmation from the row menu', async () => {
    const user = userEvent.setup()
    render(<WebhooksSettings webhooks={[hook]} />)
    await user.click(
      screen.getByRole('button', { name: /Actions for https:\/\/example.com\/hook/ })
    )
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByText('Deleting https://example.com/hook')).toBeInTheDocument()
  })

  it('shows a status badge only for a non-default state', () => {
    const { rerender } = render(<WebhooksSettings webhooks={[hook]} />)
    expect(screen.queryByText('Active')).toBeNull()
    rerender(
      <WebhooksSettings webhooks={[{ ...hook, status: 'disabled', failureCount: 0 } as Webhook]} />
    )
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('shows the failure count as visible text, not only a tooltip', () => {
    render(
      <WebhooksSettings
        webhooks={[{ ...hook, failureCount: 3, lastError: 'HTTP 500' } as Webhook]}
      />
    )
    expect(screen.getByText(/3 consecutive failures/)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
  })

  it('says why a webhook was auto-disabled in visible text', () => {
    render(
      <WebhooksSettings webhooks={[{ ...hook, status: 'disabled', failureCount: 50 } as Webhook]} />
    )
    expect(screen.getByText(/Auto-disabled after 50 failures/)).toBeInTheDocument()
  })

  it('gives the reason next to New webhook once the 25 webhook limit is reached', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...hook,
      id: `w${i}`,
      url: `https://e.test/${i}`,
    }))
    const { rerender } = render(<WebhooksSettings webhooks={many as Webhook[]} />)
    expect(screen.getByRole('button', { name: 'New webhook' })).toBeDisabled()
    expect(screen.getByText(/25 webhooks/)).toBeInTheDocument()
    rerender(<WebhooksSettings webhooks={[hook]} />)
    expect(screen.queryByText(/25 webhooks/)).toBeNull()
  })
})
