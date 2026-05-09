import { describe, expect, it } from 'vitest'
import type { VHostRow, VInfoRow } from '../../types'
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
  vcpu: 2,
  vramMb: 4096,
  activeMemMb: null,
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
        vcpu: 4,
        vramMb: 1024,
        activeMemMb: null,
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
        vcpu: 4,
        vramMb: 1024,
        activeMemMb: null,
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
})
