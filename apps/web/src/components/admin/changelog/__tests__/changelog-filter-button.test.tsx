// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { ChangelogFilterButton } from '../changelog-filters'

afterEach(cleanup)

describe('ChangelogFilterButton', () => {
  it('does not warn that the trigger is a native button', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <IntlProvider locale="en" defaultLocale="en" onError={() => {}}>
        <ChangelogFilterButton status="all" onStatusChange={() => {}} />
      </IntlProvider>
    )
    const warnings = error.mock.calls
      .map((args) => String(args[0]))
      .filter((message) => message.includes('A component that acts as a button'))
    error.mockRestore()
    expect(warnings).toEqual([])
  })

  it('offers the entry statuses under a Filter control', async () => {
    const onStatusChange = vi.fn()
    render(
      <IntlProvider locale="en" defaultLocale="en" onError={() => {}}>
        <ChangelogFilterButton status="all" onStatusChange={onStatusChange} />
      </IntlProvider>
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Filter' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Scheduled' }))
    expect(onStatusChange).toHaveBeenCalledWith('scheduled')
  })
})
