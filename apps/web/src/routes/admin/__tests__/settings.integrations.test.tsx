// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/admin/settings/integrations/integration-list', () => ({
  IntegrationList: () => <p>integration catalog</p>,
}))

const { IntegrationsSettingsBody } =
  await import('@/components/admin/settings/integrations/integrations-settings-body')

describe('integrations settings page', () => {
  it('shows the catalog', () => {
    render(<IntegrationsSettingsBody catalog={[]} integrations={[]} />)
    expect(screen.getByText('integration catalog')).toBeTruthy()
  })
})
