// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import zhCn from '@/locales/zh-cn.json'
import { ThemeSwitcher } from '../theme-switcher'

afterEach(cleanup)

describe('ThemeSwitcher', () => {
  it('names the themes in the reader’s language', async () => {
    render(
      <IntlProvider locale="zh-cn" defaultLocale="en" messages={zhCn}>
        <ThemeSwitcher />
      </IntlProvider>
    )
    for (const key of ['system', 'light', 'dark'] as const) {
      expect(await screen.findByText(zhCn[`portal.header.theme.${key}`])).toBeTruthy()
    }
  })
})
