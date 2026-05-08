import type { VInfoRow } from '../../types'

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
 * Group powered-on VMs by cluster and sum their resource allocations.
 */
export const aggregateVmsPerCluster = (vinfo: VInfoRow[]): ClusterVmStats[] => {
  const grouped = groupByCluster(vinfo)
  const out: ClusterVmStats[] = []
  for (const [cluster, vms] of grouped) {
    out.push({
      cluster,
      vmCount: vms.length,
      vcpuAllocated: vms.reduce((acc, v) => acc + v.vcpu, 0),
      vramAllocatedMb: vms.reduce((acc, v) => acc + v.vramMb, 0),
      activeMemMb: sumActiveMem(vms),
    })
  }
  return out
}
