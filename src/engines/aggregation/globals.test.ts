import { describe, expect, it } from 'vitest'
import type { ClusterAggregate, VHostRow, VInfoRow } from '../../types'
import { aggregateClusters } from './aggregateClusters'
import { aggregateGlobals } from './globals'

const baseAggregate = (overrides: Partial<ClusterAggregate>): ClusterAggregate => ({
  cluster: 'CL_DEFAULT',
  hostCount: 1,
  vmCount: 0,
  physicalCores: 24,
  usablePhysicalCores: 24,
  vcpuPerPcpu: 0,
  physicalGhz: 100,
  consumedGhz: 25,
  availableGhz: 75,
  physicalRamMb: 524288,
  consumedRamMb: 157286,
  drReservedRamMb: 0,
  availableRamMb: 367002,
  meanCpuRatio: 0.25,
  maxCpuRatio: 0.25,
  minCpuRatio: 0.25,
  meanRamRatio: 0.3,
  maxRamRatio: 0.3,
  minRamRatio: 0.3,
  vcpuAllocated: 0,
  vramAllocatedMb: 0,
  activeMemMb: null,
  mhzPerVcpu: 0,
  stretched: false,
  drReservedGhz: 0,
  ...overrides,
})

describe('aggregateGlobals', () => {
  it('returns the zero summary for an empty input', () => {
    expect(aggregateGlobals([])).toEqual({
      clusterCount: 0,
      hostCount: 0,
      vmCount: 0,
      physicalCores: 0,
      usablePhysicalCores: 0,
      vcpuPerPcpu: 0,
      physicalGhz: 0,
      consumedGhz: 0,
      availableGhz: 0,
      physicalRamMb: 0,
      consumedRamMb: 0,
      drReservedRamMb: 0,
      availableRamMb: 0,
      meanCpuRatio: 0,
      meanRamRatio: 0,
      vcpuAllocated: 0,
      vramAllocatedMb: 0,
      activeMemMb: null,
      mhzPerVcpu: 0,
      stretchedClusterCount: 0,
      drReservedGhz: 0,
    })
  })

  it('sums host, VM and capacity counts across clusters', () => {
    const out = aggregateGlobals([
      baseAggregate({
        cluster: 'A',
        hostCount: 4,
        vmCount: 60,
        physicalGhz: 230,
        consumedGhz: 50,
        availableGhz: 180,
      }),
      baseAggregate({
        cluster: 'B',
        hostCount: 2,
        vmCount: 30,
        physicalGhz: 100,
        consumedGhz: 20,
        availableGhz: 80,
      }),
    ])
    expect(out.clusterCount).toBe(2)
    expect(out.hostCount).toBe(6)
    expect(out.vmCount).toBe(90)
    expect(out.physicalGhz).toBe(330)
    expect(out.consumedGhz).toBe(70)
    expect(out.availableGhz).toBe(260)
  })

  it('sums RAM rollups across clusters', () => {
    const out = aggregateGlobals([
      baseAggregate({
        cluster: 'A',
        physicalRamMb: 1_000_000,
        consumedRamMb: 300_000,
        drReservedRamMb: 0,
        availableRamMb: 700_000,
      }),
      baseAggregate({
        cluster: 'B',
        physicalRamMb: 500_000,
        consumedRamMb: 150_000,
        drReservedRamMb: 0,
        availableRamMb: 350_000,
      }),
    ])
    expect(out.physicalRamMb).toBe(1_500_000)
    expect(out.consumedRamMb).toBe(450_000)
    expect(out.drReservedRamMb).toBe(0)
    expect(out.availableRamMb).toBe(1_050_000)
  })

  it('counts stretched clusters and sums their DR reservations', () => {
    const out = aggregateGlobals([
      baseAggregate({
        cluster: 'A',
        stretched: true,
        drReservedGhz: 100,
        drReservedRamMb: 500_000,
      }),
      baseAggregate({ cluster: 'B', stretched: false, drReservedGhz: 0, drReservedRamMb: 0 }),
      baseAggregate({ cluster: 'C', stretched: true, drReservedGhz: 50, drReservedRamMb: 200_000 }),
    ])
    expect(out.stretchedClusterCount).toBe(2)
    expect(out.drReservedGhz).toBe(150)
    expect(out.drReservedRamMb).toBe(700_000)
  })

  it('weights meanCpuRatio by physical capacity (consumed / physical)', () => {
    // CL_BIG: 1000 GHz physical, 100 GHz consumed (10 %)
    // CL_SMALL: 10 GHz physical, 5 GHz consumed (50 %)
    // capacity-weighted mean = 105 / 1010 ≈ 0.104
    const out = aggregateGlobals([
      baseAggregate({ cluster: 'BIG', hostCount: 10, physicalGhz: 1000, consumedGhz: 100 }),
      baseAggregate({ cluster: 'SMALL', hostCount: 1, physicalGhz: 10, consumedGhz: 5 }),
    ])
    expect(out.meanCpuRatio).toBeCloseTo(105 / 1010, 5)
  })

  it('weights meanRamRatio by physical capacity (consumedRamMb / usableRamMb)', () => {
    // CL_BIG: 1 000 000 MB physical, 100 000 MB consumed (10 %)
    // CL_SMALL:    10 000 MB physical,   5 000 MB consumed (50 %)
    // capacity-weighted estate mean = 105 000 / 1 010 000 ≈ 0.104.
    // ADR-0011 replaced the old host-count-weighted average.
    const out = aggregateGlobals([
      baseAggregate({
        cluster: 'BIG',
        hostCount: 10,
        physicalRamMb: 1_000_000,
        consumedRamMb: 100_000,
      }),
      baseAggregate({
        cluster: 'SMALL',
        hostCount: 1,
        physicalRamMb: 10_000,
        consumedRamMb: 5_000,
      }),
    ])
    expect(out.meanRamRatio).toBeCloseTo(105_000 / 1_010_000, 5)
  })

  it('makes meanCpuRatio / meanRamRatio DR-aware at the estate level', () => {
    // 1 stretched cluster: 200 GHz physical, 50 consumed, 100 reserved
    //   → consumedGhz/usableGhz = 50/(200-100) = 0.5
    // RAM mirrors: 200 000 MB physical, 50 000 consumed, 100 000 reserved
    //   → 50 000/(200 000-100 000) = 0.5
    const out = aggregateGlobals([
      baseAggregate({
        cluster: 'CL',
        physicalGhz: 200,
        consumedGhz: 50,
        drReservedGhz: 100,
        physicalRamMb: 200_000,
        consumedRamMb: 50_000,
        drReservedRamMb: 100_000,
        stretched: true,
      }),
    ])
    expect(out.meanCpuRatio).toBeCloseTo(0.5, 5)
    expect(out.meanRamRatio).toBeCloseTo(0.5, 5)
  })

  it('returns activeMemMb=null when no cluster reports it', () => {
    const out = aggregateGlobals([
      baseAggregate({ activeMemMb: null }),
      baseAggregate({ activeMemMb: null }),
    ])
    expect(out.activeMemMb).toBeNull()
  })

  it('sums activeMemMb across reporting clusters only', () => {
    const out = aggregateGlobals([
      baseAggregate({ activeMemMb: 1024 }),
      baseAggregate({ activeMemMb: null }),
      baseAggregate({ activeMemMb: 512 }),
    ])
    expect(out.activeMemMb).toBe(1536)
  })

  it('computes mhzPerVcpu = consumedGhz × 1000 / vcpuAllocated globally', () => {
    const out = aggregateGlobals([
      baseAggregate({ consumedGhz: 100, vcpuAllocated: 1000 }),
      baseAggregate({ consumedGhz: 50, vcpuAllocated: 500 }),
    ])
    expect(out.mhzPerVcpu).toBeCloseTo((150 * 1000) / 1500, 5)
  })

  it('returns 0 mhzPerVcpu when no vCPU is allocated (no Infinity at the boundary)', () => {
    const out = aggregateGlobals([baseAggregate({ consumedGhz: 100, vcpuAllocated: 0 })])
    expect(out.mhzPerVcpu).toBe(0)
  })
})

/**
 * Sanity test that the full pipeline (parser → aggregateClusters →
 * aggregateGlobals) reproduces the structural figures called out in the
 * plan: ~23 % global CPU, ~385 MHz/vCPU, ~8136 GHz unused.
 *
 * Synthetic estate sized to land on those numbers within rounding rather
 * than recreate the real `Classeur2.xlsx` (we don't ship that file).
 */
describe('plan reference numbers', () => {
  it('reproduces 23 % CPU global, ~385 MHz/vCPU, ~8131 GHz unused', () => {
    const HOSTS = 100
    const CORES = 44
    const SPEED_MHZ = 2400
    const CPU_RATIO = 0.23
    const VCPU_TOTAL = 6312

    const vhost: VHostRow[] = Array.from({ length: HOSTS }, (_, i) => ({
      hostName: `esx-${i.toString().padStart(2, '0')}`,
      cluster: 'CL_REF',
      cores: CORES,
      speedMhz: SPEED_MHZ,
      memoryMb: 524288,
      cpuRatio: CPU_RATIO,
      ramRatio: 0.3,
    }))
    // Spread VCPU_TOTAL across many small powered-on VMs.
    const VM_COUNT = 1000
    const VCPU_EACH = Math.floor(VCPU_TOTAL / VM_COUNT) // 6
    const remainder = VCPU_TOTAL - VCPU_EACH * VM_COUNT // 312
    const vinfo: VInfoRow[] = Array.from({ length: VM_COUNT }, (_, i) => ({
      vmName: `vm-${i.toString().padStart(4, '0')}`,
      cluster: 'CL_REF',
      vcpu: VCPU_EACH + (i < remainder ? 1 : 0),
      vramMb: 4096,
      activeMemMb: null,
      poweredOn: true,
    }))

    const clusters = aggregateClusters({ vhost, vinfo })
    const summary = aggregateGlobals(clusters)

    // physical = 100 × 44 × 2400 / 1000 = 10 560 GHz
    expect(summary.physicalGhz).toBeCloseTo(10560, 5)
    // consumed = 23 % × 10 560 = 2 428.8 GHz
    expect(summary.consumedGhz).toBeCloseTo(2428.8, 5)
    // available = 8 131.2 GHz (the plan rounds to 8 136 — same order)
    expect(summary.availableGhz).toBeCloseTo(8131.2, 5)
    // CPU ratio recovers to exactly 0.23
    expect(summary.meanCpuRatio).toBeCloseTo(0.23, 5)
    // mhzPerVcpu = 2 428.8 × 1000 / 6 312 ≈ 384.79 — round to 385
    expect(Math.round(summary.mhzPerVcpu)).toBe(385)
  })
})
