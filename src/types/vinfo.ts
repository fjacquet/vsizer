/**
 * Canonical VM row produced by the RVTools / Live Optics adapters. Adapters
 * normalize column names, casing and locale variants into this shape so the
 * downstream engines never branch on the original source format.
 *
 * Field set is intentionally minimal until the parser engine lands; extend
 * here (and in the matching Zod schema) as adapters expose more columns.
 */
export interface VInfoRow {
  vmName: string
  cluster: string
  /** ESXi host this VM runs on. Source columns:
   *  - RVTools: `vInfo.Host` (always present in 4.x exports).
   *  - Live Optics modern: `VMs.Host` (present in 2025+ exports;
   *    verified against a real `LiveOptics_*.xlsx`).
   *  - Live Optics classic: not exposed on `VM Inventory` — `host`
   *    is `''` from that source. Forward-compatible if a future
   *    build adds the column.
   *  Used by the parser-layer `synthesizeOrphanClusters` step
   *  (ADR-0014) to attribute clusterless VMs to the specific
   *  standalone host they live on. Empty when the source doesn't
   *  expose it. */
  host: string
  /** vCPU count of the VM. */
  vcpu: number
  /** Allocated memory in MB. */
  vramMb: number
  /** Active memory in MB, where reported by the source; null otherwise. */
  activeMemMb: number | null
  /** Percentage of time this VM was ready to run but could not get
   *  scheduled on a pCPU (0..100, theoretically up to ~200 when summed
   *  across vCPUs). Source: RVTools `vInfo.Overall Cpu Readiness`
   *  (= VMware `summary.quickStats.OverallCpuReadiness`, an
   *  instantaneous ~20 s sample). Always `null` for Live Optics inputs
   *  — the workbook does not expose it. See ADR-0012. */
  cpuReadinessPercent: number | null
  poweredOn: boolean
}
