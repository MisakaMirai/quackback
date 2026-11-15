// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/admin/conversation/macros-manager', () => ({
  MacrosManager: () => <p>macro library</p>,
}))

const { MacrosSettingsBody } = await import('@/components/admin/settings/macros-settings-body')

describe('macros settings page', () => {
  it('shows the library', () => {
    render(<MacrosSettingsBody creating={false} onCreatingChange={() => {}} />)
    expect(screen.getByText('macro library')).toBeTruthy()
  })
})
