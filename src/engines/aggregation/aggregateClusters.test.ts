import { describe, expect, it } from 'vitest'
import type { VHostRow, VInfoRow } from '../../types'
import { aggregateClusters } from './aggregateClusters'

const host = (overrides: Partial<VHostRow>): VHostRow => ({
  hostName: 'esx-default',
  cluster: 'CL_DEFAULT',
  cores: 24,
  speedMhz: 2400,
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
})
