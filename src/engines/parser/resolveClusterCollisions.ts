import type { VHostRow, VInfoRow } from '../../types'

/**
 * Rows tagged with the workbook filename they came from. Produced by
 * `useDatasetUpload` while it iterates a multi-file upload before the
 * single store write.
 */
export interface FileScopedRows {
  filename: string
  vinfo: VInfoRow[]
  vhost: VHostRow[]
}

/** File extensions we strip when building a collision suffix — must mirror
 *  the `ACCEPTED_EXTENSIONS` list in `FileDropzone.tsx`. */
const STRIPPABLE_EXTENSION = /\.(xlsx|xlsm|xlsb|csv|ods|zip)$/i

const stripExtension = (filename: string): string => filename.replace(STRIPPABLE_EXTENSION, '')

/**
 * Concatenate rows from N workbooks into a single (vinfo, vhost) pair,
 * disambiguating cluster names that collide across files.
 *
 * Algorithm (issue #7, ADR-0017):
 *   1. Walk all `vhost` rows and build `Map<clusterName, Set<filename>>`.
 *      The host side defines the cluster set — same convention as
 *      `aggregateClusters`.
 *   2. A cluster whose set has size > 1 is colliding. For each colliding
 *      cluster, every contributing file's rows (BOTH `vhost` and `vinfo`)
 *      get the cluster field rewritten to
 *      `"<original> (<filename without extension>)"`. Clusters that
 *      appear in exactly one file are left untouched.
 *   3. The function never mutates its input — it produces fresh row
 *      copies for the rewritten rows and pass-through references for
 *      the rest.
 *
 * Edge case: VMs whose `cluster` field doesn't appear in any host row of
 * the same file are passed through unchanged. `aggregateClusters` will
 * later drop them (the existing single-file behaviour).
 */
export const resolveClusterCollisions = (
  perFile: FileScopedRows[],
): { vinfo: VInfoRow[]; vhost: VHostRow[] } => {
  // Step 1: build the collision map from host rows.
  const filesPerCluster = new Map<string, Set<string>>()
  for (const file of perFile) {
    const localClusters = new Set<string>()
    for (const h of file.vhost) localClusters.add(h.cluster)
    for (const cluster of localClusters) {
      const set = filesPerCluster.get(cluster) ?? new Set<string>()
      set.add(file.filename)
      filesPerCluster.set(cluster, set)
    }
  }

  const isColliding = (cluster: string): boolean => (filesPerCluster.get(cluster)?.size ?? 0) > 1

  // Step 2: rewrite or pass through per file.
  const outVhost: VHostRow[] = []
  const outVinfo: VInfoRow[] = []

  for (const file of perFile) {
    const suffix = ` (${stripExtension(file.filename)})`

    for (const h of file.vhost) {
      outVhost.push(isColliding(h.cluster) ? { ...h, cluster: `${h.cluster}${suffix}` } : h)
    }
    for (const v of file.vinfo) {
      outVinfo.push(isColliding(v.cluster) ? { ...v, cluster: `${v.cluster}${suffix}` } : v)
    }
  }

  return { vinfo: outVinfo, vhost: outVhost }
}
