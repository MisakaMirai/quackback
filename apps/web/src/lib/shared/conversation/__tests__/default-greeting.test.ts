import { createIntl } from 'react-intl'
import { describe, expect, it } from 'vitest'
import zhCn from '@/locales/zh-cn.json'
import { DEFAULT_WELCOME_MESSAGE, shownGreeting } from '../default-greeting'

const chinese = createIntl({ locale: 'zh-cn', messages: zhCn })

describe('shownGreeting', () => {
  it('speaks the visitor language when the workspace kept the default greeting', () => {
    expect(shownGreeting(DEFAULT_WELCOME_MESSAGE, chinese)).toBe(
      zhCn['widget.messenger.defaultGreeting']
    )
    expect(shownGreeting(DEFAULT_WELCOME_MESSAGE, chinese)).not.toBe(DEFAULT_WELCOME_MESSAGE)
    expect(shownGreeting(DEFAULT_WELCOME_MESSAGE, createIntl({ locale: 'en' }))).toBe(
      DEFAULT_WELCOME_MESSAGE
    )
  })

  it('never touches a greeting the team wrote', () => {
    expect(shownGreeting('Welcome to Acme support', chinese)).toBe('Welcome to Acme support')
    expect(shownGreeting(null, chinese)).toBeNull()
  })
})
