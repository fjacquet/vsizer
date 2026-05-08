import { describe, expect, it } from 'vitest'
import { consumedGhz, mhzToGhz, physicalGhz } from './ghz'

describe('mhzToGhz', () => {
  it('divides MHz by 1000', () => {
    expect(mhzToGhz(2400)).toBe(2.4)
    expect(mhzToGhz(0)).toBe(0)
  })
})

describe('physicalGhz', () => {
  it('multiplies nominal speed by core count', () => {
    // 24 cores × 2.4 GHz = 57.6 GHz of nominal capacity.
    expect(physicalGhz(2400, 24)).toBeCloseTo(57.6)
  })

  it('returns zero when either dimension is zero', () => {
    expect(physicalGhz(0, 24)).toBe(0)
    expect(physicalGhz(2400, 0)).toBe(0)
  })
})

describe('consumedGhz', () => {
  it('applies the cpuRatio to physical capacity', () => {
    // 57.6 GHz × 25 % = 14.4 GHz consumed.
    expect(consumedGhz(2400, 24, 0.25)).toBeCloseTo(14.4)
  })

  it('returns zero for an idle host', () => {
    expect(consumedGhz(2400, 24, 0)).toBe(0)
  })
})
