import type { VInfoRow } from '../../types'
import { CONTENTION_THRESHOLDS, TOP_N_DEFAULT } from './contention'

/**
 * VM-side rollup for one cluster. Powered-off VMs are deliberately excluded
 * — their allocated vCPU/vRAM are not contending for capacity, so counting
 * them would distort the mhz-per-vCPU and overcommit ratios the dashboard
 * surfaces.
 */
export interface ClusterVmStats {
  cluster: string
  vmCount: number
  vcpuAllocated: number
  vramAllocatedMb: number
  /** Sum of activeMemMb across reporting VMs. `null` when no VM in the
   *  cluster reports active memory (typical for RVTools-only inputs). */
  activeMemMb: number | null
  /** Arithmetic mean of `cpuReadinessPercent` across powered-on VMs that
   *  reported it (in percent). `null` when no VM reported. ADR-0012. */
  meanCpuReadinessPercent: number | null
  /** Largest reported `cpuReadinessPercent` in the cluster, or `null`. */
  maxCpuReadinessPercent: number | null
  /** Count of powered-on VMs whose readiness exceeds
   *  `CONTENTION_THRESHOLDS.warning` (5 %). `0` when readiness is
   *  unreported — never infer absence as "all healthy". */
  vmsAboveReadinessWarning: number
  /** True iff at least one powered-on VM reported a readiness value. */
  readinessAvailable: boolean
}

/**
 * One row in the per-cluster top-N annex (PPTX) and dashboard sub-section.
 * Distinct from `VInfoRow` because `cpuReadinessPercent` is non-null here
 * (only reporting VMs make the list) and the row only carries fields the
 * annex actually displays.
 */
export interface TopReadinessVm {
  vmName: string
  cluster: string
  vcpu: number
  cpuReadinessPercent: number
}

const groupByCluster = (rows: VInfoRow[]): Map<string, VInfoRow[]> => {
  const out = new Map<string, VInfoRow[]>()
  for (const row of rows) {
    if (!row.poweredOn) continue
    if (row.cluster.length === 0) continue
    const list = out.get(row.cluster) ?? []
    list.push(row)
    out.set(row.cluster, list)
  }
  return out
}

const sumActiveMem = (rows: VInfoRow[]): number | null => {
  const reported = rows.filter((r) => r.activeMemMb !== null)
  if (reported.length === 0) return null
  return reported.reduce((acc, r) => acc + (r.activeMemMb ?? 0), 0)
}

/**
 * Per-cluster CPU Ready statistics. Mirrors the `sumActiveMem` shape:
 * filter reporters, return null/false when none, otherwise compute.
 *
 * Mean is **arithmetic** (not vCPU-weighted) — see ADR-0012 §3 for why
 * the dilution effect of weighting hurts exactly the cohort the metric
 * exists to detect.
 *
 * Implementation notes:
 * - Reporter filter via type guard (`!= null` covers both null and
 *   undefined; the `is number` predicate narrows the array element type
 *   so the rest of the function reads `number` without an `as` cast,
 *   matching CLAUDE.md's "narrow instead of assert" rule). The
 *   `Number.isFinite` check defends against any NaN/Infinity that
 *   slipped past the parser layer.
 * - Max is computed via `reduce`, not `Math.max(...values)`, to avoid
 *   the V8 ~65 535 spread-argument limit on hyperscaler-sized clusters.
 */
const readinessStats = (
  rows: VInfoRow[],
): {
  mean: number | null
  max: number | null
  countAboveWarning: number
  available: boolean
} => {
  const values: number[] = []
  for (const r of rows) {
    const v = r.cpuReadinessPercent
    if (v != null && Number.isFinite(v)) values.push(v)
  }
  if (values.length === 0) {
    return { mean: null, max: null, countAboveWarning: 0, available: false }
  }
  let sum = 0
  let max = Number.NEGATIVE_INFINITY
  let countAboveWarning = 0
  for (const v of values) {
    sum += v
    if (v > max) max = v
    if (v > CONTENTION_THRESHOLDS.warning) countAboveWarning += 1
  }
  return { mean: sum / values.length, max, countAboveWarning, available: true }
}

/**
 * Group powered-on VMs by cluster and sum their resource allocations.
 */
export const aggregateVmsPerCluster = (vinfo: VInfoRow[]): ClusterVmStats[] => {
  const grouped = groupByCluster(vinfo)
  const out: ClusterVmStats[] = []
  for (const [cluster, vms] of grouped) {
    const ready = readinessStats(vms)
    out.push({
      cluster,
      vmCount: vms.length,
      vcpuAllocated: vms.reduce((acc, v) => acc + v.vcpu, 0),
      vramAllocatedMb: vms.reduce((acc, v) => acc + v.vramMb, 0),
      activeMemMb: sumActiveMem(vms),
      meanCpuReadinessPercent: ready.mean,
      maxCpuReadinessPercent: ready.max,
      vmsAboveReadinessWarning: ready.countAboveWarning,
      readinessAvailable: ready.available,
    })
  }
  return out
}

/**
 * Build a per-cluster map of the top-N most-contended VMs (sorted desc by
 * `cpuReadinessPercent`). Only powered-on VMs that reported a value make
 * the list; clusters with no reporters are absent from the map.
 *
 * Kept separate from `aggregateVmsPerCluster` so the heavy `topReadinessVms`
 * array doesn't get pinned onto `ClusterAggregate` (which we want to keep
 * lean for the schema and the store). Callers (`Cockpit.tsx`,
 * `useExport.ts`) compute it once via `useMemo` and pass per-cluster slices
 * to the renderer.
 *
 * See ADR-0012 §4.
 */
export const topReadinessVmsByCluster = (
  vinfo: VInfoRow[],
  topN: number = TOP_N_DEFAULT,
): Map<string, TopReadinessVm[]> => {
  const grouped = groupByCluster(vinfo)
  const out = new Map<string, TopReadinessVm[]>()
  for (const [cluster, vms] of grouped) {
    // Single-pass narrow: `cpuReadinessPercent` is `number | null` on
    // VInfoRow, so we widen via local `const v` and only push reporters
    // that pass a finiteness check. Avoids the `as number` cast.
    const reporters: TopReadinessVm[] = []
    for (const r of vms) {
      const v = r.cpuReadinessPercent
      if (v != null && Number.isFinite(v)) {
        reporters.push({
          vmName: r.vmName,
          cluster: r.cluster,
          vcpu: r.vcpu,
          cpuReadinessPercent: v,
        })
      }
    }
    const top = reporters
      .sort((a, b) => b.cpuReadinessPercent - a.cpuReadinessPercent)
      .slice(0, topN)
    if (top.length > 0) out.set(cluster, top)
  }
  return out
}
