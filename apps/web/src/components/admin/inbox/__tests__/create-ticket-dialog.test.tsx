// @vitest-environment happy-dom
/**
 * Create-ticket dialog — convergence Phase 4: the registry type picker
 * (category default preselected), the type swap exchanging the dynamic field
 * set, inline validation against the chosen type's fields, and the submit
 * payload carrying ticketTypeId + validated customAttributes (never a bare
 * category alongside a registry type), and the from-a-conversation flow
 * offering the whole registry — a back-office type opened there keeps the
 * conversation through the same link step the customer pair uses. Phase 5 adds
 * the copilot auto-fill:
 * the "✨ Auto-fill" affordance (flag-gated, from-a-conversation only),
 * suggestion markers + undo, the not-suggested state, the quiet unavailable
 * fallback, and submits carrying edited suggestions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'
import type { ReactNode } from 'react'
import type { TicketTypeDTO } from '@/lib/shared/tickets'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  listTicketTypesFn: vi.fn(),
  linkTicketToConversationFn: vi.fn(),
  suggestTicketFieldValuesFn: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
  uploading: false,
  routeContext: {
    settings: { featureFlags: {} },
  } as Record<string, unknown>,
}))

vi.mock('@/lib/client/mutations/inbox', () => ({
  useCreateTicket: () => ({ mutate: mocks.mutate, isPending: false }),
}))
vi.mock('@/lib/server/functions/ticket-types', () => ({
  listTicketTypesFn: mocks.listTicketTypesFn,
}))
vi.mock('@/lib/server/functions/tickets', () => ({
  linkTicketToConversationFn: mocks.linkTicketToConversationFn,
  suggestTicketFieldValuesFn: mocks.suggestTicketFieldValuesFn,
}))
vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => mocks.routeContext,
}))
vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: vi.fn(),
    warning: mocks.toastWarning,
    error: vi.fn(),
  },
}))
// Heavy/irrelevant children stubbed: the rich editor (tiptap), file upload,
// and the requester picker (covered by its own surface).
vi.mock('@/components/ui/rich-text-editor', () => ({ RichTextEditor: () => null }))
vi.mock('@/lib/client/hooks/use-file-upload', () => ({
  useAgentFileUpload: () => ({ upload: vi.fn() }),
}))
vi.mock('@/lib/client/hooks/use-conversation-composer-attachments', () => ({
  useConversationComposerAttachments: () => ({
    items: [],
    attachments: [],
    addFiles: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    clear: vi.fn(),
    restore: vi.fn(),
    uploading: mocks.uploading,
    hasErrors: false,
  }),
}))
vi.mock('@/components/shared/portal-user-picker', () => ({ PortalUserPicker: () => null }))
vi.mock('@/components/ui/select', async () => import('@/test/radix-select'))

import { CreateTicketDialog } from '../create-ticket-dialog'

const field = (over: Partial<TicketTypeDTO['fields'][number]>) => ({
  key: 'field',
  label: 'Field',
  type: 'text' as const,
  required: false,
  visibleToCustomer: true,
  order: 0,
  ...over,
})

const bugType: TicketTypeDTO = {
  id: 'ticket_type_bug',
  name: 'Bug report',
  slug: 'bug_report',
  category: 'customer',
  icon: '🐛',
  color: '#eab308',
  fields: [field({ key: 'steps', label: 'Steps to reproduce' })],
  isDefault: true,
  position: 0,
  intakeVisible: true,
  archived: false,
}

const refundType: TicketTypeDTO = {
  id: 'ticket_type_refund',
  name: 'Refund request',
  slug: 'refund_request',
  category: 'customer',
  icon: '💳',
  color: '#22c55e',
  fields: [field({ key: 'order_id', label: 'Order id', required: true })],
  isDefault: false,
  position: 1,
  intakeVisible: true,
  archived: false,
}

const taskType: TicketTypeDTO = {
  id: 'ticket_type_task',
  name: 'Internal task',
  slug: 'internal_task',
  category: 'back_office',
  icon: '🛠️',
  color: '#8b5cf6',
  fields: [],
  isDefault: true,
  position: 2,
  intakeVisible: false,
  archived: false,
}

const outageType: TicketTypeDTO = {
  id: 'ticket_type_outage',
  name: 'Outage',
  slug: 'outage',
  category: 'tracker',
  icon: '📡',
  color: '#6b7280',
  fields: [],
  isDefault: true,
  position: 0,
  intakeVisible: false,
  archived: false,
}

function wrapper(messages: Record<string, string> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en" messages={messages}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  )
}

function renderDialog(props: Partial<Parameters<typeof CreateTicketDialog>[0]> = {}) {
  return render(<CreateTicketDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} {...props} />, {
    wrapper: wrapper(),
  })
}

/** Open a Select and pick one of its options by visible text. */
async function pickSelectOption(trigger: HTMLElement, optionText: string) {
  const option = await screen.findByRole('option', { name: new RegExp(optionText) })
  fireEvent.change(trigger, { target: { value: (option as HTMLOptionElement).value } })
}

beforeEach(() => {
  Element.prototype.scrollIntoView ??= (() => {}) as never
  mocks.mutate.mockReset()
  mocks.linkTicketToConversationFn.mockReset()
  mocks.suggestTicketFieldValuesFn.mockReset()
  mocks.toastInfo.mockReset()
  mocks.toastWarning.mockReset()
  mocks.routeContext = { settings: { featureFlags: {} } }
  mocks.listTicketTypesFn.mockReset()
  mocks.listTicketTypesFn.mockResolvedValue([bugType, refundType, taskType, outageType])
  mocks.uploading = false
})

afterEach(cleanup)

it.each(['code', 'message'] as const)(
  'localizes the protected test link conflict by %s while keeping the created ticket visible',
  async (kind) => {
    const onCreated = vi.fn()
    const onOpenChange = vi.fn()
    const onChanged = vi.fn()
    mocks.linkTicketToConversationFn.mockImplementation(async ({ data }) => {
      expect(data).toEqual({ ticketId: 'ticket_acme', conversationId: 'conversation_acme' })
      throw kind === 'code'
        ? Object.assign(new Error('Server link diagnostic'), { code: 'TEST_DATA_LINK_CONFLICT' })
        : new Error('Test and real conversations need separate tickets.')
    })
    render(
      <CreateTicketDialog
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        onChanged={onChanged}
        conversationId={'conversation_acme' as never}
        defaultTitle="Acme request"
      />,
      {
        wrapper: wrapper({
          'support.ticket.createDialog.testDataLinkConflict': 'Acme localized link conflict',
        }),
      }
    )
    await screen.findByText('Steps to reproduce')
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce())
    const [input, handlers] = mocks.mutate.mock.calls[0]
    expect(input).toMatchObject({
      title: 'Acme request',
      sourceConversationId: 'conversation_acme',
    })
    await handlers.onSuccess({ id: 'ticket_acme' })
    expect(mocks.toastWarning).toHaveBeenCalledExactlyOnceWith('Acme localized link conflict')
    expect(onCreated).toHaveBeenCalledExactlyOnceWith('ticket_acme')
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(onChanged).toHaveBeenCalledOnce()
  }
)

describe('CreateTicketDialog — Phase 4 type picker', () => {
  it('preselects the customer-category default type and renders its fields', async () => {
    renderDialog()
    // The default type leads: its name in the trigger, its field set below.
    expect(await screen.findByText('Bug report')).toBeInTheDocument()
    expect(await screen.findByText('Steps to reproduce')).toBeInTheDocument()
    expect(screen.queryByText('Order id')).toBeNull()
  })

  it('swapping types swaps the dynamic field set', async () => {
    renderDialog()
    const trigger = await screen.findByRole('combobox')
    expect(await screen.findByText('Steps to reproduce')).toBeInTheDocument()

    await pickSelectOption(trigger, 'Refund request')
    expect(await screen.findByText('Order id')).toBeInTheDocument()
    expect(screen.queryByText('Steps to reproduce')).toBeNull()
  })

  it('blocks submit on a required type field with an inline error', async () => {
    renderDialog()
    await pickSelectOption(await screen.findByRole('combobox'), 'Refund request')
    fireEvent.change(await screen.findByPlaceholderText('Summarize the request…'), {
      target: { value: 'Refund missing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }))

    expect(await screen.findByText('Order id is required')).toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('submits with ticketTypeId + validated customAttributes and no bare category', async () => {
    renderDialog()
    await pickSelectOption(await screen.findByRole('combobox'), 'Refund request')
    fireEvent.change(await screen.findByPlaceholderText('Summarize the request…'), {
      target: { value: 'Refund missing' },
    })
    // The type's required text field renders as a plain input under its label.
    const orderInput = (await screen.findByText('Order id')).parentElement!.querySelector('input')!
    fireEvent.change(orderInput, { target: { value: 'A-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }))

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1))
    const [input] = mocks.mutate.mock.calls[0]
    expect(input).toMatchObject({
      ticketTypeId: 'ticket_type_refund',
      title: 'Refund missing',
      customAttributes: { order_id: 'A-123' },
    })
    // The category is derived server-side from the type — never sent alongside.
    expect(input.type).toBeUndefined()
  })

  it('offers back-office types from a conversation, with the customer default preselected', async () => {
    renderDialog({ conversationId: 'conversation_1' as never })
    // The customer default still leads: spinning internal work off a
    // conversation is a deliberate pick, never what the dialog opens on.
    expect(await screen.findByText('Bug report')).toBeInTheDocument()
    const trigger = await screen.findByRole('combobox')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(await screen.findByRole('option', { name: /Internal task/ })).toBeInTheDocument()
  })

  it('links a back-office ticket opened from a conversation back to it', async () => {
    mocks.linkTicketToConversationFn.mockResolvedValue({ success: true })
    renderDialog({ conversationId: 'conversation_1' as never })
    await pickSelectOption(await screen.findByRole('combobox'), 'Internal task')
    fireEvent.change(await screen.findByPlaceholderText('Summarize the request…'), {
      target: { value: 'Check the billing job' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }))

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1))
    const [input, handlers] = mocks.mutate.mock.calls[0]
    expect(input).toMatchObject({
      ticketTypeId: 'ticket_type_task',
      sourceConversationId: 'conversation_1',
    })
    expect(input.type).toBeUndefined()

    // The link step runs for every type — the conversation is kept whether the
    // ticket is the customer's pair or internal work spun off it.
    await handlers.onSuccess({ id: 'ticket_1' })
    expect(mocks.linkTicketToConversationFn).toHaveBeenCalledWith({
      data: { ticketId: 'ticket_1', conversationId: 'conversation_1' },
    })
  })
})

/** A two-field customer type for the auto-fill tests: one field the model
 *  answers, one it leaves "not suggested". */

describe('CreateTicketDialog — attachment tray', () => {
  it('offers a file picker next to the description composer', async () => {
    renderDialog()
    expect(await screen.findByRole('button', { name: 'Attach files' })).toBeInTheDocument()
  })

  it('blocks create while an image is still uploading', async () => {
    mocks.uploading = true
    renderDialog()
    fireEvent.change(await screen.findByPlaceholderText('Summarize the request…'), {
      target: { value: 'Has a title' },
    })
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }))
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
})
