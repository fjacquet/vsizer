import { beforeEach, describe, expect, it } from 'vitest'
import type { GlobalSummary, VInfoRow } from '../types'
import { useDatasetStore } from './datasetStore'

const sampleFile = new File(['fake'], 'sample.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

const sampleVm: VInfoRow = {
  vmName: 'vm-1',
  cluster: 'CL_DEMO_1',
  host: 'esx-01',
  vcpu: 4,
  vramMb: 8192,
  activeMemMb: 1024,
  cpuReadinessPercent: null,
  poweredOn: true,
}

const sampleGlobals: GlobalSummary = {
  clusterCount: 1,
  hostCount: 1,
  vmCount: 1,
  physicalCores: 24,
  usablePhysicalCores: 24,
  vcpuPerPcpu: 0.17,
  physicalGhz: 100,
  consumedGhz: 25,
  availableGhz: 75,
  physicalRamMb: 524288,
  consumedRamMb: 157286,
  drReservedRamMb: 0,
  availableRamMb: 367002,
  meanCpuRatio: 0.25,
  meanRamRatio: 0.3,
  vcpuAllocated: 4,
  vramAllocatedMb: 8192,
  activeMemMb: 1024,
  mhzPerVcpu: 6250,
  stretchedClusterCount: 0,
  drReservedGhz: 0,
  vmsAboveReadinessWarning: null,
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
    expect(s.stretchedClusters.size).toBe(0)
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
    useDatasetStore.getState().toggleStretched('CL_DEMO_1')
    expect(useDatasetStore.getState().vinfo).toHaveLength(1)

    useDatasetStore.getState().reset()
    const after = useDatasetStore.getState()
    expect(after.file).toBeNull()
    expect(after.vinfo).toEqual([])
    expect(after.globals).toBeNull()
    expect(after.selectedClusters.size).toBe(0)
    expect(after.stretchedClusters.size).toBe(0)
  })

  // ── Stretched-cluster atomic re-aggregate (ADR-0007) ──────────────────

  it('toggleStretched flips set membership', () => {
    useDatasetStore.getState().toggleStretched('CL_A')
    expect(useDatasetStore.getState().stretchedClusters.has('CL_A')).toBe(true)
    useDatasetStore.getState().toggleStretched('CL_A')
    expect(useDatasetStore.getState().stretchedClusters.has('CL_A')).toBe(false)
  })

  // ADR-0014: a single standalone host can't be a 2-site stretched
  // pair, so the store no-ops the toggle for orphan cluster names.
  // Defense-in-depth — the ClusterFilterPanel already hides the
  // toggle button for these rows.
  it('toggleStretched is a no-op for orphan (synthesized) cluster names', () => {
    const before = useDatasetStore.getState().stretchedClusters
    useDatasetStore.getState().toggleStretched('(no cluster) esx-01')
    const after = useDatasetStore.getState().stretchedClusters
    expect(after.has('(no cluster) esx-01')).toBe(false)
    // No re-aggregate side-effect either: same Set reference.
    expect(after).toBe(before)
  })

  it('toggleStretched re-aggregates GHz and RAM atomically', () => {
    // Arrange: a single cluster's worth of host + VM data, set up so we can
    // measure the math change before/after toggling.
    const vhost = [
      {
        hostName: 'esx-1',
        cluster: 'CL_X',
        cores: 24,
        speedMhz: 2400,
        memoryMb: 524288,
        cpuRatio: 0.25,
        ramRatio: 0.3,
      },
    ]
    useDatasetStore.getState().setDataset({
      file: sampleFile,
      parsed: { source: 'rvtools', vinfo: [], vhost, errors: [] },
      aggregates: {},
      globals: sampleGlobals,
    })

    // Toggle stretched on → re-aggregation should populate aggregates with
    // DR-aware figures.
    useDatasetStore.getState().toggleStretched('CL_X')
    const aggAfter = useDatasetStore.getState().aggregates.CL_X
    expect(aggAfter?.stretched).toBe(true)
    expect(aggAfter?.drReservedGhz).toBeCloseTo(28.8, 5) // 0.5 × 57.6
    expect(aggAfter?.drReservedRamMb).toBeCloseTo(262144, 0) // 0.5 × 524288
    expect(aggAfter?.availableGhz).toBeCloseTo(57.6 - 14.4 - 28.8, 5)

    // Globals also reflect the rollup.
    expect(useDatasetStore.getState().globals?.stretchedClusterCount).toBe(1)
  })
})
