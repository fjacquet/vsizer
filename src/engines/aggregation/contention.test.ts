import { describe, expect, it } from 'vitest'
import { CONTENTION_THRESHOLDS, TOP_N_DEFAULT } from './contention'

/**
 * The constants in `contention.ts` are imported by the aggregator, the
 * PPTX color helper, and the dashboard surface. A drift in either value
 * silently shifts color thresholds, the "VMs above warning" count, and
 * the annex-slide row cap simultaneously. Pin them here so an
 * accidental edit shows up as a failed test rather than a subtle UI
 * regression — see ADR-0012.
 */
describe('CONTENTION_THRESHOLDS', () => {
  it('locks the VMware-standard warning threshold at 5 %', () => {
    expect(CONTENTION_THRESHOLDS.warning).toBe(5)
  })

  it('locks the serious threshold at 10 %', () => {
    expect(CONTENTION_THRESHOLDS.serious).toBe(10)
  })

  it('keeps warning strictly below serious', () => {
    expect(CONTENTION_THRESHOLDS.warning).toBeLessThan(CONTENTION_THRESHOLDS.serious)
  })
})

describe('TOP_N_DEFAULT', () => {
  it('matches the annex-slide table geometry (10 rows)', () => {
    // Bumping this requires re-tuning `contentionAnnex.ts` row layout.
    expect(TOP_N_DEFAULT).toBe(10)
  })
})
