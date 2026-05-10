import { describe, expect, it } from 'vitest'
import {
  fmtGhzPerCore,
  fmtGhzPptx,
  fmtIntPptx,
  fmtMemMb,
  fmtMhzPptx,
  fmtPctOneDecimal,
  fmtPctWhole,
  fmtPercentOneDecimal,
  fmtRatioPptx,
} from './format'

// U+202F NARROW NO-BREAK SPACE — the thousands separator format.ts emits.
const NBSP = ' '

describe('fmtIntPptx', () => {
  it('groups thousands with a thin no-break space', () => {
    expect(fmtIntPptx(1234567)).toBe(`1${NBSP}234${NBSP}567`)
  })

  it('handles single-group numbers', () => {
    expect(fmtIntPptx(42)).toBe('42')
  })

  it('handles negative integers', () => {
    expect(fmtIntPptx(-1234)).toBe(`-1${NBSP}234`)
  })

  it('returns the em-dash placeholder for non-finite values', () => {
    expect(fmtIntPptx(Number.NaN)).toBe('—')
    expect(fmtIntPptx(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('truncates fractional parts (matches the Python int(x) behavior)', () => {
    expect(fmtIntPptx(42.9)).toBe('42')
  })
})

describe('fmtGhzPptx', () => {
  it('appends the GHz unit', () => {
    expect(fmtGhzPptx(2430)).toBe(`2${NBSP}430 GHz`)
  })

  it('renders an em-dash unit for non-finite values', () => {
    expect(fmtGhzPptx(Number.NaN)).toBe('— GHz')
  })
})

describe('fmtMhzPptx', () => {
  it('appends the MHz unit', () => {
    expect(fmtMhzPptx(385)).toBe('385 MHz')
  })
})

describe('fmtPctWhole', () => {
  it('rounds to the nearest integer percent', () => {
    expect(fmtPctWhole(0.234)).toBe('23%')
    expect(fmtPctWhole(0.236)).toBe('24%')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtPctWhole(Number.NaN)).toBe('—')
  })
})

describe('fmtPctOneDecimal', () => {
  it('keeps one decimal of precision', () => {
    expect(fmtPctOneDecimal(0.234)).toBe('23.4%')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtPctOneDecimal(Number.NaN)).toBe('—')
  })
})

// ADR-0012: pre-percent formatter for CPU Ready (source value is
// already in percent units, not a 0..1 ratio).
describe('fmtPercentOneDecimal', () => {
  it('renders an already-percent value with one decimal and "%" suffix', () => {
    expect(fmtPercentOneDecimal(8.4)).toBe('8.4%')
  })

  it('renders zero explicitly as "0.0%" (distinct from absence)', () => {
    expect(fmtPercentOneDecimal(0)).toBe('0.0%')
  })

  it('rounds to one decimal', () => {
    // Use a value that rounds cleanly across IEEE 754 representations
    // (7.55 is actually 7.5499999... in float and goes down to "7.5").
    expect(fmtPercentOneDecimal(7.65)).toBe('7.7%')
  })

  it('does NOT multiply by 100 (distinct from fmtPctOneDecimal)', () => {
    // A 0.5 ratio would render as "50.0%" via fmtPctOneDecimal; here it
    // stays at "0.5%" because the input is already a percent.
    expect(fmtPercentOneDecimal(0.5)).toBe('0.5%')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtPercentOneDecimal(Number.NaN)).toBe('—')
    expect(fmtPercentOneDecimal(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('fmtMemMb', () => {
  it('formats sub-GB amounts as MB (no decimals)', () => {
    expect(fmtMemMb(512)).toBe('512 MB')
  })

  it('formats GB amounts with one decimal', () => {
    expect(fmtMemMb(8192)).toBe('8.0 GB')
    expect(fmtMemMb(8500)).toBe('8.3 GB')
  })

  it('formats TB amounts with one decimal', () => {
    expect(fmtMemMb(2 * 1024 * 1024)).toBe('2.0 TB')
  })

  it('returns em-dash for non-finite input', () => {
    expect(fmtMemMb(Number.NaN)).toBe('—')
  })
})

describe('fmtRatioPptx', () => {
  it('renders ratio with NBSP-separated colon', () => {
    const out = fmtRatioPptx(4.2)
    expect(out).toMatch(/^4[.,]2.:.1$/) // NBSP between digits and ":" and "1"
    // Verify the actual NBSP byte:
    expect(out).toContain(`${NBSP}:${NBSP}1`)
  })

  it('returns em-dash for zero, NaN, Infinity', () => {
    expect(fmtRatioPptx(0)).toBe('—')
    expect(fmtRatioPptx(Number.NaN)).toBe('—')
    expect(fmtRatioPptx(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('fmtGhzPerCore', () => {
  it('converts MHz to GHz with two decimals', () => {
    expect(fmtGhzPerCore(2400)).toBe('2.40 GHz/core')
  })

  it('returns em-dash for non-finite or zero input (no division surprises)', () => {
    expect(fmtGhzPerCore(Number.NaN)).toBe('— GHz/core')
    expect(fmtGhzPerCore(0)).toBe('— GHz/core')
  })
})
