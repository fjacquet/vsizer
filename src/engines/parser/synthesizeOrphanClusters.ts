import type { VHostRow, VInfoRow } from '../../types'

/**
 * Per-host fallback prefix for ESXi hosts that have no cluster
 * assignment in the source workbook. See ADR-0014 — VMware allows
 * standalone hosts under a datacenter, and those exports otherwise
 * trip the "No clusters detected" gate at the aggregation entry.
 *
 * Each clusterless host becomes its own synthetic cluster named
 * `<ORPHAN_CLUSTER_PREFIX>${hostName}`, so the deck still has one
 * row per actual standalone box. The literal prefix (trailing
 * space included) is part of the contract — downstream consumers
 * pattern-match on it in tests, and the speaker reads it verbatim
 * off the slide.
 */
export const ORPHAN_CLUSTER_PREFIX = '(no cluster) '

const isClusterEmpty = (cluster: string): boolean => cluster.length === 0

/**
 * Rewrite empty `cluster` fields on parsed rows so the aggregation
 * engine bucks them per-host instead of dropping them. Pure: returns
 * new arrays, never mutates input rows.
 *
 * Pass 1 (`vhost`): for every host with an empty cluster, emit a
 * clone whose `cluster` is `${ORPHAN_CLUSTER_PREFIX}${hostName}`.
 * Record those host names in a `Set<string>` so the VM pass can
 * join against them.
 *
 * Pass 2 (`vinfo`): for every VM with an empty cluster, look up its
 * `host` field in the orphan-host set. If matched, rewrite the VM's
 * `cluster` to the same synthesized name; otherwise leave it (the
 * downstream defensive filter at `groupByCluster` drops VMs with no
 * attributable cluster, same as today).
 *
 * **Idempotency**: rows whose `cluster` is already non-empty —
 * including rows whose `cluster` already starts with
 * `ORPHAN_CLUSTER_PREFIX` from a prior run — are left untouched.
 * Calling this function twice on the same dataset returns
 * structurally-equal output.
 *
 * **VHost with neither cluster nor hostName**: cluster stays `''`.
 * That row will be dropped by the aggregator's defensive filter —
 * a host with no identifying info at all isn't useful inventory.
 *
 * **Empty `host` on a VM**: cluster stays `''` (can't attribute to
 * a host we don't know). Same downstream behavior as the historical
 * "drop empty cluster" rule.
 */
export const synthesizeOrphanClusters = (parsed: {
  vinfo: VInfoRow[]
  vhost: VHostRow[]
}): { vinfo: VInfoRow[]; vhost: VHostRow[] } => {
  const orphanHostNames = new Set<string>()
  const vhost = parsed.vhost.map((row) => {
    if (!isClusterEmpty(row.cluster)) return row
    if (row.hostName.length === 0) return row
    orphanHostNames.add(row.hostName)
    return { ...row, cluster: `${ORPHAN_CLUSTER_PREFIX}${row.hostName}` }
  })

  // Short-circuit the VM pass when there are no orphan hosts — keeps
  // the common (every-host-clustered) path free of an O(n) clone.
  if (orphanHostNames.size === 0) {
    return { vinfo: parsed.vinfo, vhost }
  }

  const vinfo = parsed.vinfo.map((row) => {
    if (!isClusterEmpty(row.cluster)) return row
    if (!orphanHostNames.has(row.host)) return row
    return { ...row, cluster: `${ORPHAN_CLUSTER_PREFIX}${row.host}` }
  })

  return { vinfo, vhost }
}
