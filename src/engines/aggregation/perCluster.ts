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
  physicalGhz: number
  consumedGhz: number
  availableGhz: number
  meanCpuRatio: number
  maxCpuRatio: number
  minCpuRatio: number
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
 * Group hosts by cluster and compute per-cluster CPU/RAM statistics plus
 * physical and consumed GHz.
 *
 * Output is **not** sorted — `aggregateClusters` does the final stable sort
 * once the VM stats have been merged in.
 */
export const aggregateHostsPerCluster = (vhost: VHostRow[]): ClusterHostStats[] => {
  const grouped = groupByCluster(vhost)
  const out: ClusterHostStats[] = []
  for (const [cluster, hosts] of grouped) {
    const cpus = hosts.map((h) => h.cpuRatio)
    const rams = hosts.map((h) => h.ramRatio)
    const physical = sum(hosts.map((h) => physicalGhzOf(h.speedMhz, h.cores)))
    const consumed = sum(hosts.map((h) => consumedGhzOf(h.speedMhz, h.cores, h.cpuRatio)))
    out.push({
      cluster,
      hostCount: hosts.length,
      physicalGhz: physical,
      consumedGhz: consumed,
      availableGhz: physical - consumed,
      meanCpuRatio: mean(cpus),
      maxCpuRatio: Math.max(...cpus),
      minCpuRatio: Math.min(...cpus),
      meanRamRatio: mean(rams),
      maxRamRatio: Math.max(...rams),
      minRamRatio: Math.min(...rams),
    })
  }
  return out
}
