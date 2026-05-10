import { describe, expect, it } from 'vitest'
import {
  fmtGhz,
  fmtGhzValue,
  fmtInt,
  fmtMemMb,
  fmtMhzValue,
  fmtPercent,
  fmtPercentValue,
  fmtPercentWhole,
  fmtRatio,
} from './format'

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

describe('fmtPercentWhole', () => {
  it('rounds to a whole percent', () => {
    expect(fmtPercentWhole(0.234)).toContain('23')
    expect(fmtPercentWhole(0.236)).toContain('24')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtPercentWhole(Number.NaN)).toBe('—')
  })
})

// ADR-0012: pre-percent formatter for CPU Ready (source value is
// already in percent units, not a 0..1 ratio).
describe('fmtPercentValue', () => {
  it('renders an already-percent value with one decimal and "%" suffix (fr-FR)', () => {
    // fr-FR uses a comma decimal separator: "8,4 %"
    expect(fmtPercentValue(8.4)).toMatch(/^8[.,]4 %$/)
  })

  it('renders zero explicitly (distinct from absence)', () => {
    expect(fmtPercentValue(0)).toMatch(/^0[.,]0 %$/)
  })

  it('does NOT multiply by 100 (distinct from fmtPercent)', () => {
    // A 0.5 ratio would render as "50,0 %" via fmtPercent; here it
    // stays at "0,5 %" because the input is already a percent.
    expect(fmtPercentValue(0.5)).toMatch(/^0[.,]5 %$/)
  })

  it('honors the locale arg (en-US uses a dot decimal)', () => {
    expect(fmtPercentValue(8.4, 'en-US')).toBe('8.4 %')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtPercentValue(Number.NaN)).toBe('—')
    expect(fmtPercentValue(Number.POSITIVE_INFINITY)).toBe('—')
    expect(fmtPercentValue(Number.NEGATIVE_INFINITY)).toBe('—')
  })
})

describe('fmtGhzValue', () => {
  it('rounds GHz to a whole number with the unit', () => {
    expect(fmtGhzValue(2430.5)).toContain('GHz')
    expect(fmtGhzValue(2430.5)).toContain('2')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtGhzValue(Number.NaN)).toBe('—')
  })
})

describe('fmtMhzValue', () => {
  it('rounds MHz to a whole number with the unit', () => {
    expect(fmtMhzValue(384.6)).toBe('385 MHz')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtMhzValue(Number.NaN)).toBe('—')
  })
})

describe('fmtRatio', () => {
  it('renders a 1-decimal ratio with " : 1" suffix (fr-FR comma)', () => {
    expect(fmtRatio(4.2)).toMatch(/^4[.,]2 : 1$/)
  })

  it('rounds to one decimal', () => {
    expect(fmtRatio(4.25)).toMatch(/^4[.,][23] : 1$/) // banker's rounding tolerance
  })

  it('returns em-dash for non-finite or zero ratios', () => {
    expect(fmtRatio(0)).toBe('—')
    expect(fmtRatio(Number.NaN)).toBe('—')
    expect(fmtRatio(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('fmtMemMb', () => {
  it('renders sub-GB amounts as MB', () => {
    expect(fmtMemMb(512)).toContain('MB')
  })

  it('renders GB amounts with the GB unit', () => {
    expect(fmtMemMb(8192)).toContain('GB')
  })

  it('renders TB amounts with the TB unit', () => {
    expect(fmtMemMb(2 * 1024 * 1024)).toContain('TB')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtMemMb(Number.NaN)).toBe('—')
  })
})
