import { describe, expect, it } from 'vitest'
import type { VInfoRow } from '../../types'
import { aggregateVmsPerCluster, topReadinessVmsByCluster } from './vinfoMerge'

const vm = (overrides: Partial<VInfoRow>): VInfoRow => ({
  vmName: 'vm-default',
  cluster: 'CL_DEFAULT',
  host: 'esx-default',
  vcpu: 2,
  vramMb: 4096,
  activeMemMb: null,
  cpuReadinessPercent: null,
  poweredOn: true,
  ...overrides,
})

describe('aggregateVmsPerCluster', () => {
  it('returns an empty list for empty input', () => {
    expect(aggregateVmsPerCluster([])).toEqual([])
  })

  it('excludes powered-off VMs from the rollup', () => {
    const out = aggregateVmsPerCluster([
      vm({ vmName: 'on-1', cluster: 'CL', poweredOn: true, vcpu: 4 }),
      vm({ vmName: 'off-1', cluster: 'CL', poweredOn: false, vcpu: 8 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.vmCount).toBe(1)
    expect(out[0]?.vcpuAllocated).toBe(4)
  })

  // Defensive guard (ADR-0014). The parser-layer
  // `synthesizeOrphanClusters` step renames clusterless VMs whose host
  // is known. A VM that still has `cluster: ''` at the aggregator
  // boundary means we couldn't attribute it to a specific host (e.g.
  // Live Optics input where the source omits the Host column). Such a
  // row has no actionable bucket; we drop it rather than silently
  // mis-aggregating.
  it('drops VMs that arrive with an empty cluster name (defensive)', () => {
    const out = aggregateVmsPerCluster([
      vm({ vmName: 'orphan', cluster: '', host: '' }),
      vm({ vmName: 'real', cluster: 'CL' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.cluster).toBe('CL')
  })

  it('sums vCPU and vRAM across powered-on VMs in a cluster', () => {
    const [out] = aggregateVmsPerCluster([
      vm({ vmName: 'a', cluster: 'CL', vcpu: 2, vramMb: 4096 }),
      vm({ vmName: 'b', cluster: 'CL', vcpu: 4, vramMb: 8192 }),
      vm({ vmName: 'c', cluster: 'CL', vcpu: 8, vramMb: 16384 }),
    ])
    expect(out?.vmCount).toBe(3)
    expect(out?.vcpuAllocated).toBe(14)
    expect(out?.vramAllocatedMb).toBe(28672)
  })

  it('returns null active memory when no VM reports it', () => {
    const [out] = aggregateVmsPerCluster([
      vm({ cluster: 'CL', activeMemMb: null }),
      vm({ cluster: 'CL', activeMemMb: null }),
    ])
    expect(out?.activeMemMb).toBeNull()
  })

  it('sums active memory only across reporting VMs (ignores nulls)', () => {
    const [out] = aggregateVmsPerCluster([
      vm({ cluster: 'CL', activeMemMb: 1024 }),
      vm({ cluster: 'CL', activeMemMb: null }),
      vm({ cluster: 'CL', activeMemMb: 512 }),
    ])
    expect(out?.activeMemMb).toBe(1536)
  })

  it('groups VMs across multiple clusters', () => {
    const out = aggregateVmsPerCluster([
      vm({ cluster: 'CL_A', vcpu: 2 }),
      vm({ cluster: 'CL_A', vcpu: 4 }),
      vm({ cluster: 'CL_B', vcpu: 1 }),
    ])
    const byName = new Map(out.map((c) => [c.cluster, c]))
    expect(byName.get('CL_A')?.vcpuAllocated).toBe(6)
    expect(byName.get('CL_B')?.vcpuAllocated).toBe(1)
  })

  // ── ADR-0012: CPU Ready aggregation ─────────────────────────────────
  describe('CPU Ready aggregation', () => {
    it('marks readinessAvailable=false when no VM reports a value', () => {
      const [out] = aggregateVmsPerCluster([
        vm({ cluster: 'CL', cpuReadinessPercent: null }),
        vm({ cluster: 'CL', cpuReadinessPercent: null }),
      ])
      expect(out?.readinessAvailable).toBe(false)
      expect(out?.meanCpuReadinessPercent).toBeNull()
      expect(out?.maxCpuReadinessPercent).toBeNull()
      expect(out?.vmsAboveReadinessWarning).toBe(0)
    })

    it('computes mean / max only across reporting VMs (ignores nulls)', () => {
      const [out] = aggregateVmsPerCluster([
        vm({ cluster: 'CL', cpuReadinessPercent: 4 }),
        vm({ cluster: 'CL', cpuReadinessPercent: null }),
        vm({ cluster: 'CL', cpuReadinessPercent: 12 }),
      ])
      expect(out?.readinessAvailable).toBe(true)
      // arithmetic mean over reporters: (4 + 12) / 2 = 8
      expect(out?.meanCpuReadinessPercent).toBeCloseTo(8, 5)
      expect(out?.maxCpuReadinessPercent).toBe(12)
    })

    it('treats explicit zero as a reporter (distinct from null)', () => {
      const [out] = aggregateVmsPerCluster([
        vm({ cluster: 'CL', cpuReadinessPercent: 0 }),
        vm({ cluster: 'CL', cpuReadinessPercent: 0 }),
      ])
      expect(out?.readinessAvailable).toBe(true)
      expect(out?.meanCpuReadinessPercent).toBe(0)
      expect(out?.maxCpuReadinessPercent).toBe(0)
      expect(out?.vmsAboveReadinessWarning).toBe(0)
    })

    it('counts VMs strictly above the warning threshold (5 %), not at it', () => {
      const [out] = aggregateVmsPerCluster([
        vm({ cluster: 'CL', cpuReadinessPercent: 5 }), // not counted (== warning)
        vm({ cluster: 'CL', cpuReadinessPercent: 5.0001 }), // counted
        vm({ cluster: 'CL', cpuReadinessPercent: 12 }), // counted
        vm({ cluster: 'CL', cpuReadinessPercent: 4.99 }), // not counted
      ])
      expect(out?.vmsAboveReadinessWarning).toBe(2)
    })

    it('excludes powered-off VMs from CPU Ready stats too', () => {
      const [out] = aggregateVmsPerCluster([
        vm({ cluster: 'CL', poweredOn: true, cpuReadinessPercent: 8 }),
        vm({ cluster: 'CL', poweredOn: false, cpuReadinessPercent: 99 }), // ignored
      ])
      expect(out?.meanCpuReadinessPercent).toBe(8)
      expect(out?.maxCpuReadinessPercent).toBe(8)
    })
  })
})

// Top-N export of the most-contended VMs per cluster.
describe('topReadinessVmsByCluster', () => {
  it('returns an empty map when no VM in any cluster reports readiness', () => {
    const out = topReadinessVmsByCluster([vm({ cluster: 'CL_A' }), vm({ cluster: 'CL_B' })])
    expect(out.size).toBe(0)
  })

  it('omits clusters that have no readiness reporters', () => {
    const out = topReadinessVmsByCluster([
      vm({ cluster: 'CL_A', cpuReadinessPercent: 7 }),
      vm({ cluster: 'CL_B' }), // no reporters → no entry
    ])
    expect([...out.keys()]).toEqual(['CL_A'])
  })

  it('sorts the per-cluster list by cpuReadinessPercent descending', () => {
    const out = topReadinessVmsByCluster([
      vm({ vmName: 'low', cluster: 'CL', cpuReadinessPercent: 2 }),
      vm({ vmName: 'high', cluster: 'CL', cpuReadinessPercent: 18 }),
      vm({ vmName: 'mid', cluster: 'CL', cpuReadinessPercent: 8 }),
    ])
    expect(out.get('CL')?.map((v) => v.vmName)).toEqual(['high', 'mid', 'low'])
  })

  it('caps the per-cluster list at topN (default 10)', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      vm({ vmName: `vm-${i}`, cluster: 'CL', cpuReadinessPercent: i + 1 }),
    )
    const out = topReadinessVmsByCluster(rows)
    expect(out.get('CL')).toHaveLength(10)
  })

  it('respects a custom topN', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      vm({ vmName: `vm-${i}`, cluster: 'CL', cpuReadinessPercent: i + 1 }),
    )
    const out = topReadinessVmsByCluster(rows, 3)
    expect(out.get('CL')).toHaveLength(3)
    // The three largest values are 15, 14, 13.
    expect(out.get('CL')?.map((v) => v.cpuReadinessPercent)).toEqual([15, 14, 13])
  })

  it('skips powered-off VMs', () => {
    const out = topReadinessVmsByCluster([
      vm({ vmName: 'on', cluster: 'CL', poweredOn: true, cpuReadinessPercent: 4 }),
      vm({ vmName: 'off', cluster: 'CL', poweredOn: false, cpuReadinessPercent: 99 }),
    ])
    expect(out.get('CL')?.map((v) => v.vmName)).toEqual(['on'])
  })
})
