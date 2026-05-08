import { beforeEach, describe, expect, it } from 'vitest'
import { useDatasetStore } from './datasetStore'

describe('datasetStore', () => {
  beforeEach(() => {
    useDatasetStore.getState().reset()
  })

  it('starts empty', () => {
    const s = useDatasetStore.getState()
    expect(s.file).toBeNull()
    expect(s.vinfo).toEqual([])
    expect(s.vhost).toEqual([])
    expect(s.selectedClusters.size).toBe(0)
    expect(s.aggregates).toEqual({})
  })

  it('toggleCluster adds, then removes, a cluster name', () => {
    const { toggleCluster } = useDatasetStore.getState()
    toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().selectedClusters.has('CL_DEMO_1')).toBe(true)
    toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().selectedClusters.has('CL_DEMO_1')).toBe(false)
  })

  it('reset returns the store to its initial shape after mutation', () => {
    const s = useDatasetStore.getState()
    s.setRows({
      vinfo: [
        {
          vmName: 'vm-1',
          cluster: 'CL_DEMO_1',
          vcpu: 4,
          vramMb: 8192,
          activeMemMb: 1024,
          poweredOn: true,
        },
      ],
      vhost: [],
    })
    s.toggleCluster('CL_DEMO_1')
    expect(useDatasetStore.getState().vinfo).toHaveLength(1)

    useDatasetStore.getState().reset()
    const after = useDatasetStore.getState()
    expect(after.vinfo).toEqual([])
    expect(after.selectedClusters.size).toBe(0)
  })
})
