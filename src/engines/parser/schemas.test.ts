import { describe, expect, it } from 'vitest'
import {
  ClusterAggregateSchema,
  GlobalSummarySchema,
  VHostRowSchema,
  VInfoRowSchema,
} from './schemas'

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
      memoryMb: 524288,
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
        memoryMb: 524288,
        cpuRatio: 0.5,
        ramRatio: 0.5,
      }),
    ).toThrow()
  })

  it('rejects negative memoryMb', () => {
    expect(() =>
      VHostRowSchema.parse({
        hostName: 'esx-01',
        cluster: 'CL_DEMO_1',
        cores: 24,
        speedMhz: 2400,
        memoryMb: -1,
        cpuRatio: 0.5,
        ramRatio: 0.5,
      }),
    ).toThrow()
  })

  it('accepts memoryMb = 0 (missing-column fallback)', () => {
    const row = {
      hostName: 'esx-01',
      cluster: 'CL_DEMO_1',
      cores: 24,
      speedMhz: 2400,
      memoryMb: 0,
      cpuRatio: 0.5,
      ramRatio: 0.5,
    }
    expect(VHostRowSchema.parse(row)).toEqual(row)
  })
})

describe('ClusterAggregateSchema', () => {
  const goodAggregate = {
    cluster: 'CL_DEMO_1',
    hostCount: 4,
    vmCount: 60,
    physicalCores: 96,
    usablePhysicalCores: 96,
    vcpuPerPcpu: 5,
    physicalGhz: 230.4,
    consumedGhz: 57.6,
    availableGhz: 172.8,
    physicalRamMb: 2_097_152,
    consumedRamMb: 650_117,
    drReservedRamMb: 0,
    availableRamMb: 1_447_035,
    meanCpuRatio: 0.25,
    maxCpuRatio: 0.32,
    minCpuRatio: 0.18,
    meanRamRatio: 0.31,
    maxRamRatio: 0.4,
    minRamRatio: 0.22,
    vcpuAllocated: 480,
    vramAllocatedMb: 524288,
    activeMemMb: 65536,
    mhzPerVcpu: 120,
    stretched: false,
    drReservedGhz: 0,
  }

  it('accepts a well-formed aggregate', () => {
    expect(ClusterAggregateSchema.parse(goodAggregate)).toEqual(goodAggregate)
  })

  it('accepts null active memory (RVTools-only inputs)', () => {
    expect(ClusterAggregateSchema.parse({ ...goodAggregate, activeMemMb: null })).toMatchObject({
      activeMemMb: null,
    })
  })

  it('rejects aggregates with negative vcpuAllocated', () => {
    expect(() => ClusterAggregateSchema.parse({ ...goodAggregate, vcpuAllocated: -1 })).toThrow()
  })

  it('accepts a stretched aggregate with non-zero DR reservations', () => {
    const stretched = {
      ...goodAggregate,
      stretched: true,
      drReservedGhz: 115.2,
      drReservedRamMb: 1_048_576,
    }
    expect(ClusterAggregateSchema.parse(stretched)).toEqual(stretched)
  })
})

describe('GlobalSummarySchema', () => {
  it('accepts a well-formed estate summary', () => {
    const summary = {
      clusterCount: 18,
      hostCount: 312,
      vmCount: 6312,
      physicalCores: 7488,
      usablePhysicalCores: 7488,
      vcpuPerPcpu: 0.84,
      physicalGhz: 10560,
      consumedGhz: 2428.8,
      availableGhz: 8131.2,
      physicalRamMb: 163_577_856,
      consumedRamMb: 50_709_136,
      drReservedRamMb: 0,
      availableRamMb: 112_868_720,
      meanCpuRatio: 0.23,
      meanRamRatio: 0.31,
      vcpuAllocated: 6312,
      vramAllocatedMb: 4_194_304,
      activeMemMb: null,
      mhzPerVcpu: 384.79,
      stretchedClusterCount: 0,
      drReservedGhz: 0,
    }
    expect(GlobalSummarySchema.parse(summary)).toEqual(summary)
  })
})
