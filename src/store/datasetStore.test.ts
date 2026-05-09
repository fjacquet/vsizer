import { beforeEach, describe, expect, it } from 'vitest'
import type { GlobalSummary, VInfoRow } from '../types'
import { useDatasetStore } from './datasetStore'

const sampleFile = new File(['fake'], 'sample.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

const sampleVm: VInfoRow = {
  vmName: 'vm-1',
  cluster: 'CL_DEMO_1',
  vcpu: 4,
  vramMb: 8192,
  activeMemMb: 1024,
  poweredOn: true,
}

const sampleGlobals: GlobalSummary = {
  clusterCount: 1,
  hostCount: 1,
  vmCount: 1,
  physicalGhz: 100,
  consumedGhz: 25,
  availableGhz: 75,
  meanCpuRatio: 0.25,
  meanRamRatio: 0.3,
  vcpuAllocated: 4,
  vramAllocatedMb: 8192,
  activeMemMb: 1024,
  mhzPerVcpu: 6250,
}

describe('datasetStore', () => {
  beforeEach(() => {
    useDatasetStore.getState().reset()
  })

  it('starts empty', () => {
    const s = useDatasetStore.getState()
    expect(s.file).toBeNull()
    expect(s.source).toBe('unknown')
    expect(s.vinfo).toEqual([])
    expect(s.vhost).toEqual([])
    expect(s.parseErrors).toEqual([])
    expect(s.selectedClusters.size).toBe(0)
    expect(s.aggregates).toEqual({})
    expect(s.globals).toBeNull()
  })

  it('toggleCluster adds, then removes, a cluster name', () => {
    const { toggleCluster } = useDatasetStore.getState()
    toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().selectedClusters.has('CL_DEMO_1')).toBe(true)
    toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().selectedClusters.has('CL_DEMO_1')).toBe(false)
  })

  it('clearSelection wipes the set without resetting other fields', () => {
    const s = useDatasetStore.getState()
    s.toggleCluster('A')
    s.toggleCluster('B')
    expect(useDatasetStore.getState().selectedClusters.size).toBe(2)
    useDatasetStore.getState().clearSelection()
    expect(useDatasetStore.getState().selectedClusters.size).toBe(0)
  })

  it('setDataset populates every field at once and clears the selection', () => {
    // Pre-mutate selection so we can verify it gets reset on a new dataset.
    useDatasetStore.getState().toggleCluster('STALE')

    useDatasetStore.getState().setDataset({
      file: sampleFile,
      parsed: {
        source: 'rvtools',
        vinfo: [sampleVm],
        vhost: [],
        errors: [{ sheet: 'vinfo', index: 7, message: 'bogus' }],
      },
      aggregates: {},
      globals: sampleGlobals,
    })

    const s = useDatasetStore.getState()
    expect(s.file).toBe(sampleFile)
    expect(s.source).toBe('rvtools')
    expect(s.vinfo).toHaveLength(1)
    expect(s.parseErrors).toHaveLength(1)
    expect(s.globals).toEqual(sampleGlobals)
    // Old selection is wiped.
    expect(s.selectedClusters.size).toBe(0)
  })

  it('reset returns the store to its initial shape after mutation', () => {
    useDatasetStore.getState().setDataset({
      file: sampleFile,
      parsed: { source: 'rvtools', vinfo: [sampleVm], vhost: [], errors: [] },
      aggregates: {},
      globals: sampleGlobals,
    })
    useDatasetStore.getState().toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().vinfo).toHaveLength(1)

    useDatasetStore.getState().reset()
    const after = useDatasetStore.getState()
    expect(after.file).toBeNull()
    expect(after.vinfo).toEqual([])
    expect(after.globals).toBeNull()
    expect(after.selectedClusters.size).toBe(0)
  })
})
