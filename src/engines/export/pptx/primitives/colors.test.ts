import { describe, expect, it } from 'vitest'
import { THEME } from '../theme'
import { usageColor } from './colors'

describe('usageColor', () => {
  it('returns green strictly below 40 %', () => {
    expect(usageColor(0)).toBe(THEME.green)
    expect(usageColor(0.39)).toBe(THEME.green)
  })

  it('returns orange in [40 %, 70 %)', () => {
    expect(usageColor(0.4)).toBe(THEME.orange)
    expect(usageColor(0.69)).toBe(THEME.orange)
  })

  it('returns red at and above 70 %', () => {
    expect(usageColor(0.7)).toBe(THEME.red)
    expect(usageColor(1.0)).toBe(THEME.red)
  })

  it('returns grey for non-finite input (defensive)', () => {
    expect(usageColor(Number.NaN)).toBe(THEME.grey)
  })
})
