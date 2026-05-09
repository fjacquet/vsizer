import type { VHostRow } from '../../types'
import { consumedGhz as consumedGhzOf, physicalGhz as physicalGhzOf } from './ghz'

/**
 * Host-side rollup for one cluster. Used by `aggregateClusters` and as a
 * standalone unit so the math can be tested in isolation from VM data.
 *
 * `cluster` is the original cluster name (case-preserved). Hosts whose
 * `cluster` field is empty are dropped before grouping — they're orphan
 * inventory the dashboard can't attribute.
 */
export interface ClusterHostStats {
  cluster: string
  hostCount: number
  /** Σ host.cores across this cluster's hosts. */
  physicalCores: number
  physicalGhz: number
  consumedGhz: number
  availableGhz: number
  /** Σ host.memoryMb in MB across this cluster's hosts. 0 when none of
   *  the hosts had a parseable memory column. */
  physicalRamMb: number
  /** Σ host.memoryMb × host.ramRatio across this cluster's hosts —
   *  capacity-weighted RAM consumption. 0 when `physicalRamMb` is 0. */
  consumedRamMb: number
  /** Capacity-weighted CPU utilization: `consumedGhz / physicalGhz`.
   *  Identical to `mean(host.cpuRatio)` when hosts are homogeneous;
   *  more accurate for heterogeneous clusters. See ADR-0011. */
  meanCpuRatio: number
  maxCpuRatio: number
  minCpuRatio: number
  /** Capacity-weighted RAM utilization: `consumedRamMb / physicalRamMb`.
   *  Falls back to `mean(host.ramRatio)` when `physicalRamMb === 0`
   *  (older RVTools builds without `# Memory`) so the dashboard still
   *  has a number to show. See ADR-0011. */
  meanRamRatio: number
  maxRamRatio: number
  minRamRatio: number
}

const groupByCluster = (rows: VHostRow[]): Map<string, VHostRow[]> => {
  const out = new Map<string, VHostRow[]>()
  for (const row of rows) {
    if (row.cluster.length === 0) continue
    const list = out.get(row.cluster) ?? []
    list.push(row)
    out.set(row.cluster, list)
  }
  return out
}

const sum = (xs: readonly number[]): number => xs.reduce((acc, n) => acc + n, 0)
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : sum(xs) / xs.length)

/**
 * Group hosts by cluster and compute per-cluster CPU/RAM statistics, plus
 * physical and consumed GHz, plus the host-side physical RAM sum.
 *
 * Output is **not** sorted — `aggregateClusters` does the final stable sort
 * once the VM stats have been merged in. **No DR logic here** — this stays
 * raw-stats-only; stretched-cluster reservations are applied one layer up.
 */
export const aggregateHostsPerCluster = (vhost: VHostRow[]): ClusterHostStats[] => {
  const grouped = groupByCluster(vhost)
  const out: ClusterHostStats[] = []
  for (const [cluster, hosts] of grouped) {
    const cpus = hosts.map((h) => h.cpuRatio)
    const rams = hosts.map((h) => h.ramRatio)
    const physical = sum(hosts.map((h) => physicalGhzOf(h.speedMhz, h.cores)))
    const consumed = sum(hosts.map((h) => consumedGhzOf(h.speedMhz, h.cores, h.cpuRatio)))
    const physicalRamMb = sum(hosts.map((h) => h.memoryMb))
    // Capacity-weighted RAM consumption: each host contributes its own
    // bytes-times-ratio, not the cluster's average ratio applied to its
    // own bytes. Matters on heterogeneous clusters; equivalent on
    // homogeneous ones.
    const consumedRamMb = sum(hosts.map((h) => h.memoryMb * h.ramRatio))
    const physicalCores = sum(hosts.map((h) => h.cores))
    // Capacity-weighted ratios; fallback to mean-of-ratios when the
    // capacity denominator is zero (e.g. RVTools build without the
    // `# Memory` column → physicalRamMb = 0). For CPU we always have
    // physicalGhz from cores × speedMhz, so the fallback isn't needed.
    const meanCpuRatio = physical === 0 ? 0 : consumed / physical
    const meanRamRatio = physicalRamMb === 0 ? mean(rams) : consumedRamMb / physicalRamMb
    out.push({
      cluster,
      hostCount: hosts.length,
      physicalCores,
      physicalGhz: physical,
      consumedGhz: consumed,
      availableGhz: physical - consumed,
      physicalRamMb,
      consumedRamMb,
      meanCpuRatio,
      maxCpuRatio: Math.max(...cpus),
      minCpuRatio: Math.min(...cpus),
      meanRamRatio,
      maxRamRatio: Math.max(...rams),
      minRamRatio: Math.min(...rams),
    })
  }
  return out
}
