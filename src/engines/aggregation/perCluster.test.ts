import { describe, expect, it } from 'vitest'
import type { VHostRow } from '../../types'
import { aggregateHostsPerCluster } from './perCluster'

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

describe('aggregateHostsPerCluster', () => {
  it('returns an empty list for an empty input', () => {
    expect(aggregateHostsPerCluster([])).toEqual([])
  })

  it('groups hosts by cluster and counts them', () => {
    const out = aggregateHostsPerCluster([
      host({ hostName: 'h-a1', cluster: 'CL_A' }),
      host({ hostName: 'h-a2', cluster: 'CL_A' }),
      host({ hostName: 'h-b1', cluster: 'CL_B' }),
    ])
    const byName = new Map(out.map((c) => [c.cluster, c]))
    expect(byName.get('CL_A')?.hostCount).toBe(2)
    expect(byName.get('CL_B')?.hostCount).toBe(1)
  })

  it('drops hosts with an empty cluster name (orphans)', () => {
    const out = aggregateHostsPerCluster([
      host({ hostName: 'h-orphan', cluster: '' }),
      host({ hostName: 'h-real', cluster: 'CL_A' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.cluster).toBe('CL_A')
  })

  it('computes physical, consumed and available GHz exactly', () => {
    // 2 hosts × 24 cores @ 2.4 GHz, both at 25 % CPU
    //   physical  = 2 × 24 × 2400 / 1000          = 115.2 GHz
    //   consumed  = 0.25 × 115.2                   =  28.8 GHz
    //   available = 86.4 GHz
    const [out] = aggregateHostsPerCluster([
      host({ hostName: 'h-1', cluster: 'CL', cpuRatio: 0.25 }),
      host({ hostName: 'h-2', cluster: 'CL', cpuRatio: 0.25 }),
    ])
    expect(out?.physicalGhz).toBeCloseTo(115.2, 5)
    expect(out?.consumedGhz).toBeCloseTo(28.8, 5)
    expect(out?.availableGhz).toBeCloseTo(86.4, 5)
  })

  it('returns mean / max / min ratios across the cluster', () => {
    const [out] = aggregateHostsPerCluster([
      host({ hostName: 'h-1', cluster: 'CL', cpuRatio: 0.1, ramRatio: 0.2 }),
      host({ hostName: 'h-2', cluster: 'CL', cpuRatio: 0.5, ramRatio: 0.4 }),
      host({ hostName: 'h-3', cluster: 'CL', cpuRatio: 0.3, ramRatio: 0.6 }),
    ])
    expect(out?.meanCpuRatio).toBeCloseTo(0.3, 5)
    expect(out?.maxCpuRatio).toBe(0.5)
    expect(out?.minCpuRatio).toBe(0.1)
    expect(out?.meanRamRatio).toBeCloseTo(0.4, 5)
    expect(out?.maxRamRatio).toBe(0.6)
    expect(out?.minRamRatio).toBe(0.2)
  })

  it('handles a single host (max == min == mean)', () => {
    const [out] = aggregateHostsPerCluster([
      host({ hostName: 'solo', cluster: 'CL', cpuRatio: 0.42, ramRatio: 0.18 }),
    ])
    expect(out?.meanCpuRatio).toBe(0.42)
    expect(out?.maxCpuRatio).toBe(0.42)
    expect(out?.minCpuRatio).toBe(0.42)
    expect(out?.meanRamRatio).toBe(0.18)
  })

  it('sums physicalRamMb across hosts in the cluster', () => {
    const [out] = aggregateHostsPerCluster([
      host({ hostName: 'h-1', cluster: 'CL', memoryMb: 524288 }), // 512 GB
      host({ hostName: 'h-2', cluster: 'CL', memoryMb: 524288 }), // 512 GB
    ])
    expect(out?.physicalRamMb).toBe(1_048_576) // 1 TB total
  })

  it('reports physicalRamMb = 0 when no host had a memory column', () => {
    const [out] = aggregateHostsPerCluster([
      host({ hostName: 'h-1', cluster: 'CL', memoryMb: 0 }),
      host({ hostName: 'h-2', cluster: 'CL', memoryMb: 0 }),
    ])
    expect(out?.physicalRamMb).toBe(0)
  })
})
