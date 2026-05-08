import { describe, expect, it } from 'vitest'
import { ClusterAggregateSchema, VHostRowSchema, VInfoRowSchema } from './schemas'

describe('VInfoRowSchema', () => {
  it('accepts a well-formed row with null activeMemMb', () => {
    const row = {
      vmName: 'vm-1',
      cluster: 'CL_DEMO_1',
      vcpu: 4,
      vramMb: 8192,
      activeMemMb: null,
      poweredOn: true,
    }
    expect(VInfoRowSchema.parse(row)).toEqual(row)
  })

  it('rejects a row with negative vCPU', () => {
    expect(() =>
      VInfoRowSchema.parse({
        vmName: 'vm-1',
        cluster: 'CL_DEMO_1',
        vcpu: -2,
        vramMb: 8192,
        activeMemMb: null,
        poweredOn: true,
      }),
    ).toThrow()
  })

  it('rejects a row missing required fields', () => {
    expect(() => VInfoRowSchema.parse({ vmName: 'vm-1' })).toThrow()
  })
})

describe('VHostRowSchema', () => {
  it('accepts ratios slightly above 1 (source-side clamping artefacts)', () => {
    const row = {
      hostName: 'esx-01',
      cluster: 'CL_DEMO_1',
      cores: 24,
      speedMhz: 2400,
      cpuRatio: 1.02,
      ramRatio: 0.31,
    }
    expect(VHostRowSchema.parse(row)).toEqual(row)
  })

  it('rejects negative core counts', () => {
    expect(() =>
      VHostRowSchema.parse({
        hostName: 'esx-01',
        cluster: 'CL_DEMO_1',
        cores: 0,
        speedMhz: 2400,
        cpuRatio: 0.5,
        ramRatio: 0.5,
      }),
    ).toThrow()
  })
})

describe('ClusterAggregateSchema', () => {
  it('accepts a well-formed aggregate', () => {
    const agg = {
      cluster: 'CL_DEMO_1',
      hostCount: 4,
      vmCount: 60,
      physicalGhz: 230.4,
      consumedGhz: 57.6,
      meanCpuRatio: 0.25,
      meanRamRatio: 0.31,
    }
    expect(ClusterAggregateSchema.parse(agg)).toEqual(agg)
  })
})
