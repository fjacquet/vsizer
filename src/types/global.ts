/**
 * Estate-wide rollup produced by `aggregateGlobals`. Drives the GlobalKpiBar
 * at the top of the dashboard and the title-slide bottom strip in the PPTX.
 *
 * `meanCpuRatio` is **capacity-weighted** — equivalent to
 * `consumedGhz / physicalGhz` — so a small idle cluster doesn't drag down the
 * estate average. `meanRamRatio` is host-count-weighted because we don't yet
 * track absolute host RAM at the global mean (per-cluster physicalRamMb is
 * available but not summed for the headline ratio in V1).
 */
export interface GlobalSummary {
  clusterCount: number
  hostCount: number
  vmCount: number

  // CPU
  physicalCores: number
  usablePhysicalCores: number
  /** Estate-wide consolidation ratio: Σ vcpuAllocated / Σ usablePhysicalCores. */
  vcpuPerPcpu: number
  physicalGhz: number
  consumedGhz: number
  availableGhz: number

  // RAM (host-side, mirrors CPU shape)
  physicalRamMb: number
  consumedRamMb: number
  drReservedRamMb: number
  availableRamMb: number

  meanCpuRatio: number
  meanRamRatio: number

  vcpuAllocated: number
  vramAllocatedMb: number
  activeMemMb: number | null

  mhzPerVcpu: number

  // Stretched-cluster rollup
  stretchedClusterCount: number
  drReservedGhz: number

  /** Estate-wide count of powered-on VMs whose CPU Ready exceeds the
   *  warning threshold (5 %). Sum across clusters that report
   *  readiness; `null` when no cluster reports (Live Optics-only
   *  estates). Wired but not surfaced on the title slide / KPI bar in
   *  this iteration — see ADR-0012 §7 (V2 follow-up). */
  vmsAboveReadinessWarning: number | null
}
