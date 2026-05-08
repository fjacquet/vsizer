import { describe, expect, it } from 'vitest'
import { fmtGhz, fmtInt, fmtPercent } from './format'

describe('fmtInt', () => {
  it('inserts a thousands separator for fr-FR', () => {
    // fr-FR uses NBSP (U+00A0) or NNBSP (U+202F) depending on ICU version,
    // so match any non-digit between groups.
    expect(fmtInt(1234567)).toMatch(/^1\D234\D567$/)
  })

  it('returns an em-dash for NaN', () => {
    expect(fmtInt(Number.NaN)).toBe('—')
  })

  it('returns an em-dash for ±Infinity', () => {
    expect(fmtInt(Number.POSITIVE_INFINITY)).toBe('—')
    expect(fmtInt(Number.NEGATIVE_INFINITY)).toBe('—')
  })
})

describe('fmtGhz', () => {
  it('converts MHz to GHz with the unit suffix', () => {
    // fr-FR uses comma decimal: "2,4 GHz"
    expect(fmtGhz(2400)).toContain('2,4')
    expect(fmtGhz(2400)).toContain('GHz')
  })

  it('returns an em-dash for non-finite input', () => {
    expect(fmtGhz(Number.NaN)).toBe('—')
  })
})

describe('fmtPercent', () => {
  it('formats 0.234 as 23,4 %-ish', () => {
    expect(fmtPercent(0.234)).toContain('23,4')
  })

  it('returns an em-dash for non-finite input', () => {
    expect(fmtPercent(Number.NaN)).toBe('—')
  })
})
