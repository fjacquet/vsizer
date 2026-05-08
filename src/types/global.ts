/**
 * Estate-wide rollup produced by `aggregateGlobals`. Drives the GlobalKpiBar
 * at the top of the dashboard and the title-slide subtitle in the PPTX.
 *
 * `meanCpuRatio` is **capacity-weighted** — equivalent to
 * `consumedGhz / physicalGhz` — so a small idle cluster doesn't drag down the
 * estate average. `meanRamRatio` is host-count-weighted because we don't yet
 * track absolute host RAM.
 */
export interface GlobalSummary {
  clusterCount: number
  hostCount: number
  vmCount: number

  physicalGhz: number
  consumedGhz: number
  availableGhz: number

  meanCpuRatio: number
  meanRamRatio: number

  vcpuAllocated: number
  vramAllocatedMb: number
  activeMemMb: number | null

  mhzPerVcpu: number
}
