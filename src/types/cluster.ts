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

  // ── CPU capacity ─────────────────────────────────────────────────────
  /** Σ physicalGhz across hosts (nominal speed × cores / 1000). */
  physicalGhz: number
  /** Σ consumedGhz across hosts (physicalGhz × cpuRatio). */
  consumedGhz: number
  /** physicalGhz − consumedGhz − drReservedGhz. The "GHz disponibles"
   *  figure on the deck. May go negative on overcommitted stretched
   *  clusters (the "DR at risk" signal). */
  availableGhz: number

  // ── RAM capacity (host-side, not VM-allocation) ──────────────────────
  /** Σ host.memoryMb across cluster's hosts. 0 when the parser couldn't
   *  read the host-memory column (older RVTools builds). */
  physicalRamMb: number
  /** physicalRamMb × meanRamRatio. */
  consumedRamMb: number
  /** 0.5 × physicalRamMb when stretched, else 0. */
  drReservedRamMb: number
  /** physicalRamMb − consumedRamMb − drReservedRamMb. May go negative
   *  on overcommitted stretched clusters. */
  availableRamMb: number

  // ── CPU ratios across hosts (0..1.5) ─────────────────────────────────
  meanCpuRatio: number
  maxCpuRatio: number
  minCpuRatio: number

  // ── RAM ratios across hosts (0..1.5) ─────────────────────────────────
  meanRamRatio: number
  maxRamRatio: number
  minRamRatio: number

  // ── VM allocations (powered-on VMs) ──────────────────────────────────
  /** Σ vCPU across powered-on VMs. */
  vcpuAllocated: number
  /** Σ allocated VM memory in MB across powered-on VMs. (Distinct from
   *  `physicalRamMb` — this is what VMs *asked for*, not what hosts have.) */
  vramAllocatedMb: number
  /** Σ active memory in MB across VMs that report it. `null` when no VM
   *  in the cluster reports active memory. */
  activeMemMb: number | null

  /** Average MHz consumed per allocated vCPU. `0` when vcpuAllocated is 0
   *  to avoid surfacing Infinity at the UI boundary. */
  mhzPerVcpu: number

  // ── Stretched-cluster DR (manual flag, V1) ───────────────────────────
  /** True when the user has marked this cluster as a 2-site stretched
   *  vSAN/vSphere cluster. Drives the 50 % DR reservation on both
   *  resources. See ADR-0007. */
  stretched: boolean
  /** 0.5 × physicalGhz when stretched, else 0. */
  drReservedGhz: number
}
