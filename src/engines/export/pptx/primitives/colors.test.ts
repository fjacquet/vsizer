import { describe, expect, it } from 'vitest'
import { THEME } from '../theme'
import { contentionColor, usageColor } from './colors'

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

// ADR-0012: contentionColor maps CPU Ready percent (0..200) to a
// status color using the VMware-standard thresholds (5 / 10).
describe('contentionColor', () => {
  it('returns green strictly below the warning threshold (5 %)', () => {
    expect(contentionColor(0)).toBe(THEME.green)
    expect(contentionColor(4.99)).toBe(THEME.green)
  })

  it('returns orange in [warning, serious] inclusive (5..10 %)', () => {
    expect(contentionColor(5)).toBe(THEME.orange)
    expect(contentionColor(7.5)).toBe(THEME.orange)
    expect(contentionColor(10)).toBe(THEME.orange)
  })

  it('returns red strictly above the serious threshold (10 %)', () => {
    expect(contentionColor(10.01)).toBe(THEME.red)
    expect(contentionColor(50)).toBe(THEME.red)
    expect(contentionColor(200)).toBe(THEME.red)
  })

  it('returns grey for non-finite input (defensive)', () => {
    expect(contentionColor(Number.NaN)).toBe(THEME.grey)
    expect(contentionColor(Number.POSITIVE_INFINITY)).toBe(THEME.grey)
  })
})
