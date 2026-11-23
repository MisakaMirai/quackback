// @vitest-environment happy-dom
/**
 * Smoke coverage for the conversation attributes registry manager: the row
 * list renders per definition from listConversationAttributesFn, manual
 * create/update payloads carry the form values (never AI classification
 * flags), and the row menu drives archive/restore.
 *
 * Radix Select relies on pointer-capture/layout APIs happy-dom doesn't
 * implement, so `@/components/ui/select` is swapped for a native
 * <select>/<option> pair here — the same pattern condition-editor.test.tsx /
 * monday-config.test.tsx use.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const FIXTURE_ATTRIBUTES = [
  {
    id: 'conversation_attribute_1',
    key: 'issue_type',
    label: 'Issue type',
    description: 'What kind of issue this is.',
    fieldType: 'select',
    options: [
      { id: 'opt_1', label: 'Billing', description: null },
      { id: 'opt_2', label: 'Bug', description: null },
    ],
    requiredToClose: false,
    sourceHint: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'conversation_attribute_2',
    key: 'severity',
    label: 'Severity',
    description: null,
    fieldType: 'text',
    options: null,
    requiredToClose: false,
    sourceHint: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const hoisted = vi.hoisted(() => ({
  listConversationAttributesFn: vi.fn(),
  createConversationAttributeFn: vi.fn(),
  updateConversationAttributeFn: vi.fn(),
  archiveConversationAttributeFn: vi.fn(),
  restoreConversationAttributeFn: vi.fn(),
}))

vi.mock('@/lib/server/functions/conversation-attributes', () => ({
  listConversationAttributesFn: hoisted.listConversationAttributesFn,
  createConversationAttributeFn: hoisted.createConversationAttributeFn,
  updateConversationAttributeFn: hoisted.updateConversationAttributeFn,
  archiveConversationAttributeFn: hoisted.archiveConversationAttributeFn,
  restoreConversationAttributeFn: hoisted.restoreConversationAttributeFn,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectLabel: ({ children }: { children: React.ReactNode }) => (
    <option disabled>{children}</option>
  ),
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { ConversationAttributesList } from '../conversation-attributes-list'

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
})

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** The Type <select> is the first native select rendered in the form dialog. */
function typeSelect(): HTMLSelectElement {
  return document.querySelectorAll('select')[0] as HTMLSelectElement
}

/** The source-hint <select> follows the type select in the form dialog. */
function sourceHintSelect(): HTMLSelectElement {
  return document.querySelectorAll('select')[1] as HTMLSelectElement
}

async function openCreateDialog() {
  const user = userEvent.setup()
  renderWithClient(<ConversationAttributesList />)
  // The empty registry also offers the action inside the empty state; the header's comes first.
  await user.click((await screen.findAllByRole('button', { name: /new attribute/i }))[0])
  return user
}

/** Opens the edit dialog on FIXTURE_ATTRIBUTES[0] ("Issue type"). */
async function openEditDialogForIssueType() {
  hoisted.listConversationAttributesFn.mockResolvedValue(FIXTURE_ATTRIBUTES)
  const user = userEvent.setup()
  renderWithClient(<ConversationAttributesList />)
  await screen.findByText('Issue type')
  await user.click(screen.getByRole('button', { name: 'Actions for Issue type' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  await screen.findByText('Edit attribute')
  return user
}

describe('ConversationAttributesList', () => {
  it('renders a row per definition from listConversationAttributesFn', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue(FIXTURE_ATTRIBUTES)
    renderWithClient(<ConversationAttributesList />)
    expect(await screen.findByText('Issue type')).toBeInTheDocument()
    expect(screen.getByText('Severity')).toBeInTheDocument()
  })

  it('words a workflow source hint as muted text and shows no AI badge', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([
      { ...FIXTURE_ATTRIBUTES[1], sourceHint: 'workflow' },
      { ...FIXTURE_ATTRIBUTES[0], sourceHint: 'ai' },
    ])
    renderWithClient(<ConversationAttributesList />)
    expect(await screen.findByText('Usually set by a workflow')).toBeInTheDocument()
    expect(screen.queryByText('Usually set by AI')).not.toBeInTheDocument()

    const aiRow = screen
      .getByText('Issue type')
      .closest('[data-slot="settings-list-row"]') as HTMLElement
    expect(within(aiRow).queryByText('AI')).not.toBeInTheDocument()
  })

  it('shows Required to close as a muted badge, not the warning tone', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([
      { ...FIXTURE_ATTRIBUTES[1], requiredToClose: true },
    ])
    renderWithClient(<ConversationAttributesList />)
    const badge = await screen.findByText('Required to close')
    expect(badge.className).not.toMatch(/warning/)
  })

  it('offers Edit and Archive in the row menu, Restore on an archived row', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([
      FIXTURE_ATTRIBUTES[0],
      { ...FIXTURE_ATTRIBUTES[1], archivedAt: new Date() },
    ])
    const user = userEvent.setup()
    renderWithClient(<ConversationAttributesList />)
    await screen.findByText('Issue type')

    await user.click(screen.getByRole('button', { name: 'Actions for Issue type' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Actions for Severity' }))
    expect(await screen.findByRole('menuitem', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('archives only after the confirmation dialog', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue(FIXTURE_ATTRIBUTES)
    hoisted.archiveConversationAttributeFn.mockResolvedValue({})
    const user = userEvent.setup()
    renderWithClient(<ConversationAttributesList />)
    await screen.findByText('Issue type')
    await user.click(screen.getByRole('button', { name: 'Actions for Issue type' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    expect(hoisted.archiveConversationAttributeFn).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Archive attribute' }))
    expect(hoisted.archiveConversationAttributeFn).toHaveBeenCalledWith({
      data: { id: 'conversation_attribute_1' },
    })
  })

  it('shows the empty state with a New attribute action when there are none', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([])
    renderWithClient(<ConversationAttributesList />)
    expect(await screen.findByText('No attributes yet')).toBeInTheDocument()
  })

  it('keeps the manual options editor and drops the AI authoring controls', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([])
    const user = await openCreateDialog()
    fireEvent.change(typeSelect(), { target: { value: 'select' } })

    expect(await screen.findByText('Options')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add option/i }))
    expect(screen.getByPlaceholderText('Option label')).toBeInTheDocument()

    expect(screen.queryByText('Let AI detect this attribute')).not.toBeInTheDocument()
    expect(screen.queryByText('Re-check on close')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /test detection/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /draft descriptions/i })).not.toBeInTheDocument()
  })

  it('sends the manual create payload without AI classification flags', async () => {
    hoisted.listConversationAttributesFn.mockResolvedValue([])
    hoisted.createConversationAttributeFn.mockResolvedValue({})
    const user = await openCreateDialog()

    await user.type(screen.getByLabelText('Key'), 'issue_type')
    await user.type(screen.getByLabelText('Display label'), 'Issue type')

    fireEvent.change(typeSelect(), { target: { value: 'select' } })
    await screen.findByText('Options')
    await user.click(screen.getByRole('button', { name: /add option/i }))
    await user.type(screen.getByPlaceholderText('Option label'), 'Billing')

    await user.click(screen.getByRole('switch')) // Required to close
    fireEvent.change(sourceHintSelect(), { target: { value: 'workflow' } })

    await user.click(screen.getByRole('button', { name: /create attribute/i }))

    expect(hoisted.createConversationAttributeFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: 'issue_type',
        label: 'Issue type',
        fieldType: 'select',
        options: [expect.objectContaining({ label: 'Billing' })],
        requiredToClose: true,
        sourceHint: 'workflow',
      }),
    })
    const payload = hoisted.createConversationAttributeFn.mock.calls[0][0].data
    expect(payload).not.toHaveProperty('aiDetect')
    expect(payload).not.toHaveProperty('detectOnClose')
  })

  it('sends the manual update payload without AI classification flags', async () => {
    hoisted.updateConversationAttributeFn.mockResolvedValue({})
    const user = await openEditDialogForIssueType()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(hoisted.updateConversationAttributeFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'conversation_attribute_1',
        label: 'Issue type',
        requiredToClose: false,
      }),
    })
    const payload = hoisted.updateConversationAttributeFn.mock.calls[0][0].data
    expect(payload).not.toHaveProperty('aiDetect')
    expect(payload).not.toHaveProperty('detectOnClose')
  })
})
