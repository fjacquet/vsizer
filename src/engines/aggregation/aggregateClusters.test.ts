import { describe, expect, it } from 'vitest'
import type { VHostRow, VInfoRow } from '../../types'
import { synthesizeOrphanClusters } from '../parser/synthesizeOrphanClusters'
import { aggregateClusters } from './aggregateClusters'

const host = (overrides: Partial<VHostRow>): VHostRow => ({
  hostName: 'esx-default',
  cluster: 'CL_DEFAULT',
  cores: 24,
  speedMhz: 2400,
  memoryMb: 524288, // 512 GB
  cpuRatio: 0.2,
  ramRatio: 0.3,
  ...overrides,
})

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

describe('aggregateClusters', () => {
  it('produces a ClusterAggregate for each host-bearing cluster', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL_A' }), host({ cluster: 'CL_B' })],
      vinfo: [vm({ cluster: 'CL_A', vcpu: 4 }), vm({ cluster: 'CL_B', vcpu: 2 })],
    })
    expect(out.map((c) => c.cluster)).toEqual(['CL_A', 'CL_B'])
  })

  it('returns aggregates sorted by cluster name', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL_Z' }), host({ cluster: 'CL_A' }), host({ cluster: 'CL_M' })],
      vinfo: [],
    })
    expect(out.map((c) => c.cluster)).toEqual(['CL_A', 'CL_M', 'CL_Z'])
  })

  it('drops VMs whose cluster has no hosts (orphans)', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL_A' })],
      vinfo: [vm({ cluster: 'CL_A', vcpu: 4 }), vm({ cluster: 'CL_GHOST', vcpu: 100 })],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.vcpuAllocated).toBe(4)
  })

  it('reports zero VM stats when a cluster has hosts but no powered-on VMs', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL_EMPTY' })],
      vinfo: [vm({ cluster: 'CL_EMPTY', poweredOn: false })],
    })
    expect(out[0]).toMatchObject({
      cluster: 'CL_EMPTY',
      vmCount: 0,
      vcpuAllocated: 0,
      vramAllocatedMb: 0,
      activeMemMb: null,
      mhzPerVcpu: 0,
    })
  })

  it('computes mhzPerVcpu = consumedGhz × 1000 / vcpuAllocated', () => {
    // 1 host × 24 cores × 2.4 GHz × 25 % CPU = 14.4 GHz consumed
    // 36 vCPU allocated → 14 400 MHz / 36 = 400 MHz/vCPU
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.25 })],
      vinfo: [
        vm({ cluster: 'CL', vcpu: 12 }),
        vm({ cluster: 'CL', vcpu: 12 }),
        vm({ cluster: 'CL', vcpu: 12 }),
      ],
    })
    expect(out[0]?.mhzPerVcpu).toBeCloseTo(400, 5)
  })

  it('clamps mhzPerVcpu to 0 when no vCPU is allocated (avoids Infinity)', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.25 })],
      vinfo: [],
    })
    expect(out[0]?.mhzPerVcpu).toBe(0)
  })

  it('passes through host-side stats unchanged', () => {
    const out = aggregateClusters({
      vhost: [
        host({ cluster: 'CL', cpuRatio: 0.1, ramRatio: 0.2 }),
        host({ cluster: 'CL', cpuRatio: 0.5, ramRatio: 0.4 }),
      ],
      vinfo: [],
    })
    expect(out[0]?.maxCpuRatio).toBe(0.5)
    expect(out[0]?.minCpuRatio).toBe(0.1)
    expect(out[0]?.meanCpuRatio).toBeCloseTo(0.3, 5)
  })

  // ── Stretched-cluster DR (ADR-0007) ──────────────────────────────────

  it('computes 0 DR reservation when not stretched', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.25 })],
      vinfo: [],
    })
    expect(out[0]?.stretched).toBe(false)
    expect(out[0]?.drReservedGhz).toBe(0)
    expect(out[0]?.drReservedRamMb).toBe(0)
  })

  it('reserves 50 % of physicalGhz and physicalRamMb when stretched', () => {
    // 1 host × 24 × 2.4 GHz = 57.6 GHz physical, 25 % CPU = 14.4 consumed
    // 1 host × 524288 MB physical RAM, 30 % RAM = 157286.4 consumed
    // Stretched: drReservedGhz = 28.8, drReservedRamMb = 262144
    //   availableGhz   = 57.6 − 14.4 − 28.8 = 14.4
    //   availableRamMb = 524288 − 157286.4 − 262144 = 104857.6
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.25, ramRatio: 0.3 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.stretched).toBe(true)
    expect(out[0]?.drReservedGhz).toBeCloseTo(28.8, 5)
    expect(out[0]?.drReservedRamMb).toBeCloseTo(262144, 0)
    expect(out[0]?.availableGhz).toBeCloseTo(14.4, 5)
    expect(out[0]?.availableRamMb).toBeCloseTo(104857.6, 0)
  })

  it('surfaces a negative availableGhz when a stretched cluster overcommits CPU past 50 %', () => {
    // 60 % CPU on a stretched cluster: physical 57.6, consumed 34.56,
    // dr reserved 28.8 → available = -5.76 (DR at risk).
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.6 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.availableGhz).toBeLessThan(0)
  })

  it('surfaces a negative availableRamMb when a stretched cluster overcommits RAM past 50 %', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', ramRatio: 0.6 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.availableRamMb).toBeLessThan(0)
  })

  // ── vCPU/pCPU consolidation ratio (ADR-0009) ─────────────────────────

  it('computes vcpuPerPcpu = vcpuAllocated / physicalCores (non-stretched)', () => {
    // 1 host × 24 cores; 96 vCPU allocated → 4.0 : 1
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cores: 24 })],
      vinfo: Array.from({ length: 24 }, (_, i) => ({
        vmName: `vm-${i}`,
        cluster: 'CL',
        host: 'esx-default',
        vcpu: 4,
        vramMb: 1024,
        activeMemMb: null,
        cpuReadinessPercent: null,
        poweredOn: true,
      })),
    })
    expect(out[0]?.physicalCores).toBe(24)
    expect(out[0]?.usablePhysicalCores).toBe(24)
    expect(out[0]?.vcpuPerPcpu).toBeCloseTo(4.0, 5)
  })

  it('doubles vcpuPerPcpu when the cluster is stretched (50 % cores reserved)', () => {
    // Same workload as above; stretching halves usablePhysicalCores → ratio 8.0
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cores: 24 })],
      vinfo: Array.from({ length: 24 }, (_, i) => ({
        vmName: `vm-${i}`,
        cluster: 'CL',
        host: 'esx-default',
        vcpu: 4,
        vramMb: 1024,
        activeMemMb: null,
        cpuReadinessPercent: null,
        poweredOn: true,
      })),
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.physicalCores).toBe(24)
    expect(out[0]?.usablePhysicalCores).toBe(12)
    expect(out[0]?.vcpuPerPcpu).toBeCloseTo(8.0, 5)
  })

  it('clamps vcpuPerPcpu to 0 when no vCPU is allocated', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cores: 24 })],
      vinfo: [],
    })
    expect(out[0]?.vcpuPerPcpu).toBe(0)
  })

  // ── DR-aware utilization ratios (ADR-0011) ───────────────────────────
  //
  // `meanCpuRatio` / `meanRamRatio` are capacity-weighted (consumed over
  // *usable* physical capacity). Min/max scale by the same DR factor so
  // the bar chart and the headline KPI stay consistent.

  it('doubles meanCpuRatio when stretched (50 % CPU reservation, homogeneous)', () => {
    // 1 host × 24 cores × 2.4 GHz × 25 % CPU = 14.4 GHz consumed, 57.6 physical
    // Non-stretched: 14.4 / 57.6 = 0.25
    // Stretched: 14.4 / (57.6 - 28.8) = 0.5
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.25 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.meanCpuRatio).toBeCloseTo(0.5, 5)
  })

  it('doubles meanRamRatio when stretched (50 % RAM reservation)', () => {
    // 1 host × 524288 MB × 30 % RAM = 157286.4 MB consumed
    // Non-stretched: 157286.4 / 524288 = 0.3
    // Stretched: 157286.4 / (524288 - 262144) = 0.6
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', ramRatio: 0.3 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.meanRamRatio).toBeCloseTo(0.6, 5)
  })

  it('scales per-host max/min CPU ratios by the DR factor when stretched', () => {
    // Two hosts at 0.1 / 0.5 → max=0.5, min=0.1. Stretched → 1.0 / 0.2.
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', cpuRatio: 0.1 }), host({ cluster: 'CL', cpuRatio: 0.5 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.maxCpuRatio).toBeCloseTo(1.0, 5)
    expect(out[0]?.minCpuRatio).toBeCloseTo(0.2, 5)
  })

  it('scales per-host max/min RAM ratios by the DR factor when stretched', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', ramRatio: 0.2 }), host({ cluster: 'CL', ramRatio: 0.4 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.maxRamRatio).toBeCloseTo(0.8, 5)
    expect(out[0]?.minRamRatio).toBeCloseTo(0.4, 5)
  })

  it('keeps ratios unchanged when not stretched (DR factor = 1)', () => {
    const out = aggregateClusters({
      vhost: [
        host({ cluster: 'CL', cpuRatio: 0.1, ramRatio: 0.2 }),
        host({ cluster: 'CL', cpuRatio: 0.5, ramRatio: 0.4 }),
      ],
      vinfo: [],
    })
    expect(out[0]?.meanCpuRatio).toBeCloseTo(0.3, 5)
    expect(out[0]?.meanRamRatio).toBeCloseTo(0.3, 5)
    expect(out[0]?.maxCpuRatio).toBe(0.5)
    expect(out[0]?.minCpuRatio).toBe(0.1)
    expect(out[0]?.maxRamRatio).toBe(0.4)
    expect(out[0]?.minRamRatio).toBe(0.2)
  })

  it('uses capacity-weighted meanCpuRatio (heterogeneous cluster)', () => {
    // Big host: 48 cores × 3.0 GHz = 144 GHz, 50 % CPU = 72 GHz consumed
    // Small host: 12 cores × 2.0 GHz = 24 GHz, 10 % CPU = 2.4 GHz consumed
    // Total: 168 GHz physical, 74.4 GHz consumed → 0.4429 capacity-weighted
    // Host-mean (the old, naive formula) would give (0.5 + 0.1)/2 = 0.3
    // The new code must report the capacity-weighted figure.
    const out = aggregateClusters({
      vhost: [
        host({ cluster: 'CL', cores: 48, speedMhz: 3000, cpuRatio: 0.5 }),
        host({ cluster: 'CL', cores: 12, speedMhz: 2000, cpuRatio: 0.1 }),
      ],
      vinfo: [],
    })
    expect(out[0]?.meanCpuRatio).toBeCloseTo(74.4 / 168, 5)
  })

  it('uses capacity-weighted meanRamRatio (heterogeneous cluster)', () => {
    // Big host: 1 048 576 MB at 50 % → 524 288 MB consumed
    // Small host: 262 144 MB at 10 % → 26 214.4 MB consumed
    // Total: 1 310 720 MB physical, 550 502.4 MB consumed → 0.4200
    // Host-mean would give (0.5 + 0.1)/2 = 0.3
    const out = aggregateClusters({
      vhost: [
        host({ cluster: 'CL', memoryMb: 1_048_576, ramRatio: 0.5 }),
        host({ cluster: 'CL', memoryMb: 262_144, ramRatio: 0.1 }),
      ],
      vinfo: [],
    })
    expect(out[0]?.meanRamRatio).toBeCloseTo(550502.4 / 1310720, 5)
  })

  it('falls back to host-mean RAM ratio when physicalRamMb is unknown (RVTools without # Memory)', () => {
    // Without per-host memory we can't capacity-weight; preserve the
    // signal by reporting the raw mean of host ratios.
    const out = aggregateClusters({
      vhost: [
        host({ cluster: 'CL', memoryMb: 0, ramRatio: 0.4 }),
        host({ cluster: 'CL', memoryMb: 0, ramRatio: 0.6 }),
      ],
      vinfo: [],
    })
    expect(out[0]?.physicalRamMb).toBe(0)
    expect(out[0]?.meanRamRatio).toBeCloseTo(0.5, 5)
  })

  it('handles a stretched cluster whose host-memory column is missing (physicalRamMb=0)', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL', memoryMb: 0 })],
      vinfo: [],
      stretchedClusters: new Set(['CL']),
    })
    expect(out[0]?.physicalRamMb).toBe(0)
    expect(out[0]?.consumedRamMb).toBe(0)
    expect(out[0]?.drReservedRamMb).toBe(0)
    expect(out[0]?.availableRamMb).toBe(0)
  })

  // ── CPU Ready pass-through (ADR-0012) ────────────────────────────────

  it('passes through CPU Ready stats from the VM-side rollup', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL' })],
      vinfo: [
        vm({ cluster: 'CL', cpuReadinessPercent: 4 }),
        vm({ cluster: 'CL', cpuReadinessPercent: 12 }),
      ],
    })
    expect(out[0]?.readinessAvailable).toBe(true)
    expect(out[0]?.meanCpuReadinessPercent).toBeCloseTo(8, 5)
    expect(out[0]?.maxCpuReadinessPercent).toBe(12)
    expect(out[0]?.vmsAboveReadinessWarning).toBe(1)
  })

  it('reports readinessAvailable=false when no VM in the cluster reports it (Live Optics)', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL' })],
      vinfo: [vm({ cluster: 'CL' }), vm({ cluster: 'CL' })],
    })
    expect(out[0]?.readinessAvailable).toBe(false)
    expect(out[0]?.meanCpuReadinessPercent).toBeNull()
    expect(out[0]?.maxCpuReadinessPercent).toBeNull()
    expect(out[0]?.vmsAboveReadinessWarning).toBe(0)
  })

  it('reports readinessAvailable=false when a cluster has hosts but no VMs', () => {
    const out = aggregateClusters({
      vhost: [host({ cluster: 'CL' })],
      vinfo: [],
    })
    expect(out[0]?.readinessAvailable).toBe(false)
    expect(out[0]?.meanCpuReadinessPercent).toBeNull()
    expect(out[0]?.vmsAboveReadinessWarning).toBe(0)
  })

  // ── Orphan-host bucketing end-to-end (ADR-0014) ──────────────────────
  //
  // Regression test for issue #4. The aggregator does not know about
  // orphans — it consumes the already-bucketed output of
  // `synthesizeOrphanClusters` (which `normalizeWorkbook` invokes
  // after schema validation). This test composes the two layers
  // explicitly to assert the contract: a fully clusterless dataset
  // produces one ClusterAggregate per standalone host with the
  // correct VM counts attached.
  it('produces one ClusterAggregate per standalone host for a fully clusterless dataset', () => {
    // The aggregator does not know about orphans — it consumes the
    // already-bucketed output of `synthesizeOrphanClusters`, which
    // `normalizeWorkbook` invokes after schema validation. We compose
    // the two layers explicitly here to pin the end-to-end contract.
    const raw = {
      vhost: [host({ hostName: 'esx-a', cluster: '' }), host({ hostName: 'esx-b', cluster: '' })],
      vinfo: [
        vm({ vmName: 'vm-a1', cluster: '', host: 'esx-a', vcpu: 4 }),
        vm({ vmName: 'vm-a2', cluster: '', host: 'esx-a', vcpu: 2 }),
        vm({ vmName: 'vm-b1', cluster: '', host: 'esx-b', vcpu: 8 }),
      ],
    }

    const bucketed = synthesizeOrphanClusters(raw)
    const out = aggregateClusters(bucketed)

    expect(out.map((c) => c.cluster)).toEqual(['(no cluster) esx-a', '(no cluster) esx-b'])

    const byName = new Map(out.map((c) => [c.cluster, c]))
    expect(byName.get('(no cluster) esx-a')?.hostCount).toBe(1)
    expect(byName.get('(no cluster) esx-a')?.vmCount).toBe(2)
    expect(byName.get('(no cluster) esx-a')?.vcpuAllocated).toBe(6)
    expect(byName.get('(no cluster) esx-b')?.hostCount).toBe(1)
    expect(byName.get('(no cluster) esx-b')?.vmCount).toBe(1)
    expect(byName.get('(no cluster) esx-b')?.vcpuAllocated).toBe(8)
  })
})
