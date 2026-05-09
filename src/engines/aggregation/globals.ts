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
 * - `meanCpuRatio` is **capacity-weighted and DR-aware** —
 *   `consumedGhz / (physicalGhz − drReservedGhz)`. A 30 % estate that
 *   includes a stretched cluster will drift higher because the divisor
 *   shrinks. See ADR-0011.
 * - `meanRamRatio` is now also capacity-weighted and DR-aware —
 *   `consumedRamMb / (physicalRamMb − drReservedRamMb)`. The previous
 *   host-count weighting silently mixed clusters of different sizes; the
 *   new formula is unambiguous.
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

  // Capacity-weighted, DR-aware (ADR-0011). The divisor is the *usable*
  // capacity sum, not the raw physical sum, so a stretched cluster's
  // 50 % reservation makes the headline number rise — same volume of
  // water in a smaller bucket.
  const usableGhz = physicalGhz - drReservedGhz
  const usableRamMb = physicalRamMb - drReservedRamMb
  const meanCpuRatio = usableGhz <= 0 ? 0 : consumedGhz / usableGhz
  const meanRamRatio = usableRamMb <= 0 ? 0 : consumedRamMb / usableRamMb
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
