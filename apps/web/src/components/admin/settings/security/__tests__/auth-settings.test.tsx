// @vitest-environment happy-dom
import { FORM_WIDTH_CLASS } from '@/components/admin/settings/settings-page'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AuthConfig, PortalConfig } from '@/lib/shared/types/settings'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../portal-auth-tab', () => ({
  PortalAuthTab: () => <div>portal-access-body</div>,
}))
vi.mock('../sign-in-providers-tab', () => ({
  SignInProvidersTab: () => <div>sign-in-body</div>,
}))
vi.mock('../audit-log-page', () => ({
  AuditLogPage: () => <div>audit-feed</div>,
}))

const { AuthSettings } = await import('../auth-settings')

const TEAM_AUTH = { openSignup: false } as AuthConfig
const PORTAL = {} as PortalConfig

describe('AuthSettings tabs', () => {
  it('keeps portal access on its own tab', () => {
    render(
      <AuthSettings
        tab="portal-access"
        teamAuthConfig={TEAM_AUTH}
        portalConfig={PORTAL}
        credentialStatus={{}}
        customOidcProviderTier={false}
      />
    )
    expect(screen.getByText('portal-access-body')).toBeDefined()
    expect(screen.queryByText('audit-feed')).toBeNull()
  })

  it('renders the audit feed on the audit tab', () => {
    render(
      <AuthSettings
        tab="audit-log"
        teamAuthConfig={TEAM_AUTH}
        portalConfig={PORTAL}
        credentialStatus={{}}
        customOidcProviderTier
      />
    )
    expect(screen.getByText('audit-feed')).toBeDefined()
  })

  it('keeps the tab bar at form width on every tab', () => {
    for (const tab of ['portal-access', 'sign-in', 'audit-log'] as const) {
      const { unmount } = render(
        <AuthSettings
          tab={tab}
          teamAuthConfig={TEAM_AUTH}
          portalConfig={PORTAL}
          credentialStatus={{}}
          customOidcProviderTier
        />
      )
      expect(screen.getByRole('tablist').className).toContain(FORM_WIDTH_CLASS)
      unmount()
    }
  })
})
