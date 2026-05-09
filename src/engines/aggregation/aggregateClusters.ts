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

      const drReservedRamMb = isStretched ? 0.5 * h.physicalRamMb : 0
      const availableRamMb = h.physicalRamMb - h.consumedRamMb - drReservedRamMb

      // Cores side — same DR shape as GHz / RAM. usablePhysicalCores is the
      // denominator the consolidation ratio actually uses; surfaced as a
      // field so globals can sum without re-deriving the stretched flag.
      const usablePhysicalCores = isStretched ? 0.5 * h.physicalCores : h.physicalCores
      const vcpuPerPcpu = usablePhysicalCores === 0 ? 0 : vcpuAllocated / usablePhysicalCores

      // ── DR-aware utilization ratios (ADR-0011) ───────────────────────
      //
      // Same volume of water in half the bucket = higher fill %. Apply
      // the same multiplier to both the cluster mean and the per-host
      // extremes so the bar chart and the headline KPI stay coherent.
      // Factor = physical / (physical − reserved) — equals 2 for the V1
      // 50 % reservation and 1 when not stretched.
      const cpuDrFactor =
        isStretched && h.physicalGhz > 0 ? h.physicalGhz / (h.physicalGhz - drReservedGhz) : 1
      const ramDrFactor =
        isStretched && h.physicalRamMb > 0
          ? h.physicalRamMb / (h.physicalRamMb - drReservedRamMb)
          : 1

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
        consumedRamMb: h.consumedRamMb,
        drReservedRamMb,
        availableRamMb,
        meanCpuRatio: h.meanCpuRatio * cpuDrFactor,
        maxCpuRatio: h.maxCpuRatio * cpuDrFactor,
        minCpuRatio: h.minCpuRatio * cpuDrFactor,
        meanRamRatio: h.meanRamRatio * ramDrFactor,
        maxRamRatio: h.maxRamRatio * ramDrFactor,
        minRamRatio: h.minRamRatio * ramDrFactor,
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
