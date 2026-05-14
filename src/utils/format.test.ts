import { describe, expect, it } from 'vitest'
import {
  fmtGhz,
  fmtGhzNumber,
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

describe('fmtGhzNumber', () => {
  it('is unitless and adaptive: integer for ≥10, one decimal for <10', () => {
    expect(fmtGhzNumber(230)).toBe('230')
    expect(fmtGhzNumber(10)).toBe('10')
    expect(fmtGhzNumber(5.18)).toMatch(/^5[.,]2$/)
    expect(fmtGhzNumber(0.24)).toMatch(/^0[.,]2$/)
  })

  it('handles negative values symmetrically (|v| threshold)', () => {
    // availableGhz < 0 when a stretched cluster is consumed past 50 %.
    // Adaptive precision must apply to the absolute value, not the
    // signed value, so `-7.4` reads as `"-7,4"` not `"-7"`.
    expect(fmtGhzNumber(-7.4)).toMatch(/^-7[.,]4$/)
    expect(fmtGhzNumber(-25, 'en-US')).toBe('-25')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtGhzNumber(Number.NaN)).toBe('—')
    expect(fmtGhzNumber(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('fmtGhzValue', () => {
  it('renders large clusters as integer GHz with the unit', () => {
    expect(fmtGhzValue(230)).toMatch(/^230\s?GHz$/)
  })

  // ADR-0014: standalone-host rows (e.g. 5 % of 5 GHz = 0.24 GHz) used
  // to collapse to "0 GHz" with integer rounding. Adaptive precision
  // now shows "0,2 GHz" so the user can tell measurement from absence.
  it('renders sub-10-GHz values with one decimal (adaptive precision)', () => {
    expect(fmtGhzValue(0.24)).toMatch(/^0[.,]2 GHz$/)
    expect(fmtGhzValue(5.18)).toMatch(/^5[.,]2 GHz$/)
    expect(fmtGhzValue(9.3, 'en-US')).toBe('9.3 GHz')
  })

  it('switches back to integer formatting at 10 GHz and above', () => {
    expect(fmtGhzValue(12.4)).toMatch(/^12\s?GHz$/)
    expect(fmtGhzValue(2430.5, 'en-US')).toBe('2,431 GHz')
  })

  it('renders 0 explicitly (meaningful: cluster at 100 % capacity)', () => {
    // 0 GHz is a real measurement on `availableGhz` (consumed equals
    // physical). Distinct from `mhzPerVcpu === 0` which is a sentinel.
    expect(fmtGhzValue(0)).toMatch(/^0[.,]0 GHz$/)
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtGhzValue(Number.NaN)).toBe('—')
  })
})

describe('fmtMhzValue', () => {
  it('rounds MHz to a whole number with the unit', () => {
    expect(fmtMhzValue(384.6)).toBe('385 MHz')
  })

  // ADR-0014: `mhzPerVcpu === 0` is emitted by the aggregator only
  // when `vcpuAllocated === 0` — it's a sentinel for "not applicable",
  // not a real measurement. Render as em-dash to match `fmtRatio`'s
  // convention so the dashboard doesn't read "0 MHz per vCPU".
  it('returns em-dash for zero (sentinel: no vCPUs to divide by)', () => {
    expect(fmtMhzValue(0)).toBe('—')
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
