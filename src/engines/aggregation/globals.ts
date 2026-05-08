import type { ClusterAggregate, GlobalSummary } from '../../types'

const sum = (xs: readonly number[]): number => xs.reduce((acc, n) => acc + n, 0)

const emptySummary: GlobalSummary = {
  clusterCount: 0,
  hostCount: 0,
  vmCount: 0,
  physicalGhz: 0,
  consumedGhz: 0,
  availableGhz: 0,
  meanCpuRatio: 0,
  meanRamRatio: 0,
  vcpuAllocated: 0,
  vramAllocatedMb: 0,
  activeMemMb: null,
  mhzPerVcpu: 0,
}

/**
 * Estate-wide rollup. Drives the GlobalKpiBar at the top of the dashboard
 * and the title-slide subtitle in the PPTX.
 *
 * - `meanCpuRatio` is **capacity-weighted** — equivalent to
 *   `consumedGhz / physicalGhz` — so a small idle cluster doesn't drag
 *   the headline number down.
 * - `meanRamRatio` is **host-count-weighted** because we don't yet track
 *   absolute host RAM. A future enrichment of `VHostRow.memoryMb` would let
 *   us switch to capacity weighting here too.
 * - `activeMemMb` is `null` when no cluster reports active memory; otherwise
 *   it's the sum of clusters that did. This keeps RVTools-only inputs from
 *   silently zeroing the figure.
 */
export const aggregateGlobals = (clusters: readonly ClusterAggregate[]): GlobalSummary => {
  if (clusters.length === 0) return { ...emptySummary }

  const physicalGhz = sum(clusters.map((c) => c.physicalGhz))
  const consumedGhz = sum(clusters.map((c) => c.consumedGhz))
  const hostCount = sum(clusters.map((c) => c.hostCount))
  const vmCount = sum(clusters.map((c) => c.vmCount))
  const vcpuAllocated = sum(clusters.map((c) => c.vcpuAllocated))
  const vramAllocatedMb = sum(clusters.map((c) => c.vramAllocatedMb))

  const reportedActive = clusters.filter((c) => c.activeMemMb !== null)
  const activeMemMb =
    reportedActive.length === 0
      ? null
      : reportedActive.reduce((acc, c) => acc + (c.activeMemMb ?? 0), 0)

  const meanCpuRatio = physicalGhz === 0 ? 0 : consumedGhz / physicalGhz
  const meanRamRatio =
    hostCount === 0 ? 0 : sum(clusters.map((c) => c.meanRamRatio * c.hostCount)) / hostCount
  const mhzPerVcpu = vcpuAllocated === 0 ? 0 : (consumedGhz * 1000) / vcpuAllocated

  return {
    clusterCount: clusters.length,
    hostCount,
    vmCount,
    physicalGhz,
    consumedGhz,
    availableGhz: physicalGhz - consumedGhz,
    meanCpuRatio,
    meanRamRatio,
    vcpuAllocated,
    vramAllocatedMb,
    activeMemMb,
    mhzPerVcpu,
  }
}
