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
  /** vCPU count of the VM. */
  vcpu: number
  /** Allocated memory in MB. */
  vramMb: number
  /** Active memory in MB, where reported by the source; null otherwise. */
  activeMemMb: number | null
  poweredOn: boolean
}
