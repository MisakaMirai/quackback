/**
 * Where a new sending domain's return path CNAME points, when the operator
 * serves bounce records under a domain of its own.
 */
import { describe, expect, it } from 'vitest'
import { currentInstallLabel, returnPathLabel, returnPathTarget } from '../return-path'

describe('returnPathLabel', () => {
  it('is a DNS label derived from the install key alone, stable across releases', () => {
    expect(returnPathLabel('inst_example1')).toBe('ws-8fc0ff855f96e8aa09b38e87')
    expect(returnPathLabel('inst_example1')).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
  })

  it('differs per install', () => {
    expect(returnPathLabel('inst_example1')).not.toBe(returnPathLabel('inst_example2'))
  })
})

describe('currentInstallLabel', () => {
  it('names the instance the operator configured', () => {
    expect(currentInstallLabel({ QUACKBACK_INSTANCE_ID: 'inst_example1' })).toBe(
      'ws-8fc0ff855f96e8aa09b38e87'
    )
  })

  it('falls back to a fixed marker when no instance id is set', () => {
    expect(currentInstallLabel({})).toBe(returnPathLabel('__single__'))
  })
})

describe('returnPathTarget', () => {
  const ON = { EMAIL_RETURN_PATH_DOMAIN: 'bounces.example.net' }

  it('is null when the operator serves no return path domain', () => {
    expect(returnPathTarget({})).toBeNull()
  })

  it('names the install under the operator domain, never its mail slug', () => {
    expect(returnPathTarget({ ...ON, QUACKBACK_INSTANCE_ID: 'inst_example1' })).toBe(
      'ws-8fc0ff855f96e8aa09b38e87.bounces.example.net'
    )
  })

  it('uses the fixed label when no instance id is set', () => {
    expect(returnPathTarget(ON)).toBe(`${returnPathLabel('__single__')}.bounces.example.net`)
  })
})
