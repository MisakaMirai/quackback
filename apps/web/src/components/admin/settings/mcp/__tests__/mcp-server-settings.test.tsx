// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const save = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))

vi.mock('@/lib/server/functions/settings', () => ({
  updateDeveloperConfigFn: (arg: unknown) => save(arg),
}))

const { McpServerSettings } = await import('../mcp-server-settings')

describe('McpServerSettings', () => {
  beforeEach(() => save.mockClear())

  it('turns the server on and saves', async () => {
    render(<McpServerSettings initialEnabled={false} initialDynamicRegistrationEnabled />)
    fireEvent.click(screen.getByLabelText('MCP server'))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ data: { mcpEnabled: true } })
    })
  })

  it('turns the server off and saves', async () => {
    render(<McpServerSettings initialEnabled initialDynamicRegistrationEnabled />)
    fireEvent.click(screen.getByLabelText('MCP server'))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ data: { mcpEnabled: false } })
    })
  })
})
