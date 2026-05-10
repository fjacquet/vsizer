/**
 * Per-cluster aggregate produced by the aggregation engine. One instance per
 * cluster maps 1:1 to one PPTX cluster slide and to one OverviewTable row.
 *
 * All CPU/RAM ratios are normally 0..1 floats. **In stretched clusters
 * they're DR-aware** (ADR-0011): each ratio is the host-side measurement
 * scaled by `physicalGhz / (physicalGhz − drReservedGhz)`, i.e. ×2 for the
 * V1 50 % reservation. Hence the schema cap at 3.0, not 1.5.
 */
export interface ClusterAggregate {
  cluster: string
  hostCount: number
  /** Number of powered-on VMs in this cluster. Powered-off VMs are excluded
   *  because their allocated vCPU/vRAM are not contending for capacity. */
  vmCount: number

  // ── CPU capacity ─────────────────────────────────────────────────────
  /** Σ host.cores across cluster's hosts (raw physical-core count). */
  physicalCores: number
  /** Cores actually usable for workload after a stretched-cluster
   *  reservation: `stretched ? 0.5 × physicalCores : physicalCores`.
   *  Drives the consolidation ratio; surfaced explicitly so the global
   *  rollup can sum without re-deriving the stretched flag. */
  usablePhysicalCores: number
  /** vCPU consolidation ratio: `vcpuAllocated / usablePhysicalCores`.
   *  `0` when `usablePhysicalCores === 0` (no Infinity at the UI). On a
   *  stretched cluster this is exactly **double** the non-stretched
   *  value — see ADR-0009. */
  vcpuPerPcpu: number
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
  /** Σ (host.memoryMb × host.ramRatio) — capacity-weighted RAM
   *  consumption (ADR-0011). Pre-DR-scaling, in MB. */
  consumedRamMb: number
  /** 0.5 × physicalRamMb when stretched, else 0. */
  drReservedRamMb: number
  /** physicalRamMb − consumedRamMb − drReservedRamMb. May go negative
   *  on overcommitted stretched clusters. */
  availableRamMb: number

  // ── CPU ratios — capacity-weighted, DR-aware (0..3) ──────────────────
  /** `consumedGhz / usableGhz` (= consumedGhz / (physicalGhz − drReservedGhz)).
   *  Identical to `mean(host.cpuRatio)` for homogeneous, non-stretched
   *  clusters; differs for heterogeneous or stretched ones. See ADR-0011. */
  meanCpuRatio: number
  /** Largest per-host CPU ratio, scaled by the cluster's DR factor when
   *  stretched (×2 in V1 for the 50 % reservation). */
  maxCpuRatio: number
  /** Smallest per-host CPU ratio, scaled by the cluster's DR factor. */
  minCpuRatio: number

  // ── RAM ratios — capacity-weighted, DR-aware (0..3) ──────────────────
  /** `consumedRamMb / usableRamMb`. Falls back to `mean(host.ramRatio)`
   *  when `physicalRamMb === 0` (older RVTools without `# Memory`). */
  meanRamRatio: number
  /** Largest per-host RAM ratio, scaled by the cluster's DR factor. */
  maxRamRatio: number
  /** Smallest per-host RAM ratio, scaled by the cluster's DR factor. */
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

  // ── CPU Ready / contention (RVTools-only) ───────────────────────────
  /** Arithmetic mean of per-VM `cpuReadinessPercent` across powered-on
   *  VMs that reported it (in percent, 0..200). `null` when no VM in
   *  the cluster reported readiness — typical for Live Optics inputs.
   *  See ADR-0012 for why arithmetic (not vCPU-weighted). */
  meanCpuReadinessPercent: number | null
  /** Largest reported per-VM `cpuReadinessPercent` in the cluster, or
   *  `null` when no VM reported. Restores distribution shape that the
   *  mean alone hides. */
  maxCpuReadinessPercent: number | null
  /** Count of powered-on VMs whose readiness exceeds the warning
   *  threshold (5 % per ADR-0012 / `CONTENTION_THRESHOLDS.warning`).
   *  `0` when readiness is unreported (do not infer "all healthy"). */
  vmsAboveReadinessWarning: number
  /** `true` iff at least one powered-on VM in the cluster reported a
   *  readiness value. Drives the slide / dashboard branch between the
   *  metric line and the "non disponible" line. See ADR-0012 §2. */
  readinessAvailable: boolean

  // ── Stretched-cluster DR (manual flag, V1) ───────────────────────────
  /** True when the user has marked this cluster as a 2-site stretched
   *  vSAN/vSphere cluster. Drives the 50 % DR reservation on both
   *  resources. See ADR-0007. */
  stretched: boolean
  /** 0.5 × physicalGhz when stretched, else 0. */
  drReservedGhz: number
}
