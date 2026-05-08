import { describe, expect, it } from 'vitest'
import type { VInfoRow } from '../../types'
import { aggregateVmsPerCluster } from './vinfoMerge'

const vm = (overrides: Partial<VInfoRow>): VInfoRow => ({
  vmName: 'vm-default',
  cluster: 'CL_DEFAULT',
  vcpu: 2,
  vramMb: 4096,
  activeMemMb: null,
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

  it('drops VMs with an empty cluster name', () => {
    const out = aggregateVmsPerCluster([
      vm({ vmName: 'orphan', cluster: '' }),
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
})
