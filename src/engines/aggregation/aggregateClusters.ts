import type { ClusterAggregate, VHostRow, VInfoRow } from '../../types'
import { aggregateHostsPerCluster } from './perCluster'
import { aggregateVmsPerCluster } from './vinfoMerge'

const computeMhzPerVcpu = (consumedGhz: number, vcpuAllocated: number): number =>
  vcpuAllocated === 0 ? 0 : (consumedGhz * 1000) / vcpuAllocated

/**
 * Combine the host-side and VM-side rollups into one `ClusterAggregate` per
 * cluster. The cluster set is taken from the **host** rows: a cluster with
 * VMs but no hosts cannot be sized and is therefore not surfaced. VMs whose
 * cluster doesn't match a host cluster are silently dropped.
 *
 * **Stretched-cluster handling** (ADR-0007): when a cluster's name is in the
 * `stretchedClusters` set, 50 % of physical CPU and physical RAM are reserved
 * for site-failover headroom. The math:
 *
 *   drReservedGhz   = 0.5 × physicalGhz
 *   drReservedRamMb = 0.5 × physicalRamMb
 *   availableGhz    = physicalGhz − consumedGhz − drReservedGhz
 *   availableRamMb  = physicalRamMb − consumedRamMb − drReservedRamMb
 *
 * Either available* may go negative when the cluster is consumed past 50 %
 * — that's the intended "DR at risk" signal, surfaced in red on the
 * dashboard and the deck.
 *
 * Output is sorted by cluster name so the dashboard render order is stable
 * across re-runs and so PPTX slide numbering doesn't shuffle on re-export.
 */
export const aggregateClusters = ({
  vinfo,
  vhost,
  stretchedClusters,
}: {
  vinfo: VInfoRow[]
  vhost: VHostRow[]
  stretchedClusters?: ReadonlySet<string>
}): ClusterAggregate[] => {
  const stretched = stretchedClusters ?? new Set<string>()
  const hostStats = aggregateHostsPerCluster(vhost)
  const vmStatsByCluster = new Map(aggregateVmsPerCluster(vinfo).map((s) => [s.cluster, s]))

  return hostStats
    .map((h): ClusterAggregate => {
      const v = vmStatsByCluster.get(h.cluster)
      const vcpuAllocated = v?.vcpuAllocated ?? 0
      const isStretched = stretched.has(h.cluster)

      const drReservedGhz = isStretched ? 0.5 * h.physicalGhz : 0
      const availableGhz = h.physicalGhz - h.consumedGhz - drReservedGhz

      const consumedRamMb = h.physicalRamMb * h.meanRamRatio
      const drReservedRamMb = isStretched ? 0.5 * h.physicalRamMb : 0
      const availableRamMb = h.physicalRamMb - consumedRamMb - drReservedRamMb

      // Cores side — same DR shape as GHz / RAM. usablePhysicalCores is the
      // denominator the consolidation ratio actually uses; surfaced as a
      // field so globals can sum without re-deriving the stretched flag.
      const usablePhysicalCores = isStretched ? 0.5 * h.physicalCores : h.physicalCores
      const vcpuPerPcpu = usablePhysicalCores === 0 ? 0 : vcpuAllocated / usablePhysicalCores

      return {
        cluster: h.cluster,
        hostCount: h.hostCount,
        vmCount: v?.vmCount ?? 0,
        physicalCores: h.physicalCores,
        usablePhysicalCores,
        vcpuPerPcpu,
        physicalGhz: h.physicalGhz,
        consumedGhz: h.consumedGhz,
        availableGhz,
        physicalRamMb: h.physicalRamMb,
        consumedRamMb,
        drReservedRamMb,
        availableRamMb,
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
        stretched: isStretched,
        drReservedGhz,
      }
    })
    .sort((a, b) => a.cluster.localeCompare(b.cluster))
}
