import type { ClusterAggregate, VHostRow, VInfoRow } from '../../types'
import { aggregateHostsPerCluster } from './perCluster'
import { aggregateVmsPerCluster } from './vinfoMerge'

const computeMhzPerVcpu = (consumedGhz: number, vcpuAllocated: number): number =>
  vcpuAllocated === 0 ? 0 : (consumedGhz * 1000) / vcpuAllocated

/**
 * Combine the host-side and VM-side rollups into one `ClusterAggregate` per
 * cluster. The cluster set is taken from the **host** rows: a cluster with
 * VMs but no hosts cannot be sized and is therefore not surfaced. VMs whose
 * cluster doesn't match a host cluster are silently dropped (counted as
 * orphans, same as in the parser).
 *
 * Output is sorted by cluster name so the dashboard render order is stable
 * across re-runs and so PPTX slide numbering doesn't shuffle on a re-export.
 */
export const aggregateClusters = ({
  vinfo,
  vhost,
}: {
  vinfo: VInfoRow[]
  vhost: VHostRow[]
}): ClusterAggregate[] => {
  const hostStats = aggregateHostsPerCluster(vhost)
  const vmStatsByCluster = new Map(aggregateVmsPerCluster(vinfo).map((s) => [s.cluster, s]))

  return hostStats
    .map((h): ClusterAggregate => {
      const v = vmStatsByCluster.get(h.cluster)
      const vcpuAllocated = v?.vcpuAllocated ?? 0
      return {
        cluster: h.cluster,
        hostCount: h.hostCount,
        vmCount: v?.vmCount ?? 0,
        physicalGhz: h.physicalGhz,
        consumedGhz: h.consumedGhz,
        availableGhz: h.availableGhz,
        meanCpuRatio: h.meanCpuRatio,
        maxCpuRatio: h.maxCpuRatio,
        minCpuRatio: h.minCpuRatio,
        meanRamRatio: h.meanRamRatio,
        maxRamRatio: h.maxRamRatio,
        minRamRatio: h.minRamRatio,
        vcpuAllocated,
        vramAllocatedMb: v?.vramAllocatedMb ?? 0,
        activeMemMb: v?.activeMemMb ?? null,
        mhzPerVcpu: computeMhzPerVcpu(h.consumedGhz, vcpuAllocated),
      }
    })
    .sort((a, b) => a.cluster.localeCompare(b.cluster))
}
