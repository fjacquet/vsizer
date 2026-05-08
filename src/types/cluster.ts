/**
 * Per-cluster aggregate produced by the aggregation engine. One instance per
 * cluster maps 1:1 to one PPTX cluster slide and to one OverviewTable row.
 *
 * All ratios are 0..1 floats. Slight overruns above 1 are possible when the
 * source clamps imperfectly — the schema validator caps at 1.5.
 */
export interface ClusterAggregate {
  cluster: string
  hostCount: number
  /** Number of powered-on VMs in this cluster. Powered-off VMs are excluded
   *  because their allocated vCPU/vRAM are not contending for capacity. */
  vmCount: number

  /** Σ physicalGhz across hosts (nominal speed × cores / 1000). */
  physicalGhz: number
  /** Σ consumedGhz across hosts (physicalGhz × cpuRatio). */
  consumedGhz: number
  /** physicalGhz − consumedGhz. The "GHz disponibles" figure from the deck. */
  availableGhz: number

  /** CPU utilization across hosts in this cluster, in [0, 1.5]. */
  meanCpuRatio: number
  maxCpuRatio: number
  minCpuRatio: number

  /** RAM utilization across hosts in this cluster, in [0, 1.5]. */
  meanRamRatio: number
  maxRamRatio: number
  minRamRatio: number

  /** Σ vCPU across powered-on VMs. */
  vcpuAllocated: number
  /** Σ allocated VM memory in MB across powered-on VMs. */
  vramAllocatedMb: number
  /** Σ active memory in MB across VMs that report it. `null` when no VM in
   *  the cluster reports active memory (typical for RVTools-only inputs). */
  activeMemMb: number | null

  /** Average MHz consumed per allocated vCPU. `0` when vcpuAllocated is 0
   *  to avoid surfacing Infinity at the UI boundary. */
  mhzPerVcpu: number
}
