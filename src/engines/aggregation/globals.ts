import type { ClusterAggregate, GlobalSummary } from '../../types'

const sum = (xs: readonly number[]): number => xs.reduce((acc, n) => acc + n, 0)

const emptySummary: GlobalSummary = {
  clusterCount: 0,
  hostCount: 0,
  vmCount: 0,
  physicalCores: 0,
  usablePhysicalCores: 0,
  vcpuPerPcpu: 0,
  physicalGhz: 0,
  consumedGhz: 0,
  availableGhz: 0,
  physicalRamMb: 0,
  consumedRamMb: 0,
  drReservedRamMb: 0,
  availableRamMb: 0,
  meanCpuRatio: 0,
  meanRamRatio: 0,
  vcpuAllocated: 0,
  vramAllocatedMb: 0,
  activeMemMb: null,
  mhzPerVcpu: 0,
  stretchedClusterCount: 0,
  drReservedGhz: 0,
}

/**
 * Estate-wide rollup. Drives the GlobalKpiBar at the top of the dashboard
 * and the title-slide bottom strip in the PPTX.
 *
 * - `meanCpuRatio` is **capacity-weighted** — equivalent to
 *   `consumedGhz / physicalGhz` — so a small idle cluster doesn't drag
 *   the headline number down.
 * - `meanRamRatio` is **host-count-weighted** for V1.
 * - `activeMemMb` is `null` when no cluster reports active memory; otherwise
 *   it's the sum of clusters that did. This keeps RVTools-only inputs from
 *   silently zeroing the figure.
 * - `availableGhz` and `availableRamMb` are sums of the already-DR-adjusted
 *   per-cluster numbers — they automatically pick up the reservation.
 * - `drReservedGhz` / `drReservedRamMb` are summed; `stretchedClusterCount`
 *   is a count of clusters with `stretched === true`.
 */
export const aggregateGlobals = (clusters: readonly ClusterAggregate[]): GlobalSummary => {
  if (clusters.length === 0) return { ...emptySummary }

  const physicalCores = sum(clusters.map((c) => c.physicalCores))
  const usablePhysicalCores = sum(clusters.map((c) => c.usablePhysicalCores))
  const physicalGhz = sum(clusters.map((c) => c.physicalGhz))
  const consumedGhz = sum(clusters.map((c) => c.consumedGhz))
  const availableGhz = sum(clusters.map((c) => c.availableGhz))
  const drReservedGhz = sum(clusters.map((c) => c.drReservedGhz))

  const physicalRamMb = sum(clusters.map((c) => c.physicalRamMb))
  const consumedRamMb = sum(clusters.map((c) => c.consumedRamMb))
  const drReservedRamMb = sum(clusters.map((c) => c.drReservedRamMb))
  const availableRamMb = sum(clusters.map((c) => c.availableRamMb))

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
  const vcpuPerPcpu = usablePhysicalCores === 0 ? 0 : vcpuAllocated / usablePhysicalCores

  return {
    clusterCount: clusters.length,
    hostCount,
    vmCount,
    physicalCores,
    usablePhysicalCores,
    vcpuPerPcpu,
    physicalGhz,
    consumedGhz,
    availableGhz,
    physicalRamMb,
    consumedRamMb,
    drReservedRamMb,
    availableRamMb,
    meanCpuRatio,
    meanRamRatio,
    vcpuAllocated,
    vramAllocatedMb,
    activeMemMb,
    mhzPerVcpu,
    stretchedClusterCount: clusters.filter((c) => c.stretched).length,
    drReservedGhz,
  }
}
