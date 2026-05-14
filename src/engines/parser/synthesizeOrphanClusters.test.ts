import { describe, expect, it } from 'vitest'
import type { VHostRow, VInfoRow } from '../../types'
import { synthesizeOrphanClusters } from './synthesizeOrphanClusters'

const host = (overrides: Partial<VHostRow> = {}): VHostRow => ({
  hostName: 'esx-01',
  cluster: '',
  cores: 16,
  speedMhz: 2600,
  memoryMb: 262_144,
  cpuRatio: 0.3,
  ramRatio: 0.4,
  ...overrides,
})

const vm = (overrides: Partial<VInfoRow> = {}): VInfoRow => ({
  vmName: 'vm-1',
  cluster: '',
  host: 'esx-01',
  vcpu: 2,
  vramMb: 4096,
  activeMemMb: null,
  cpuReadinessPercent: null,
  poweredOn: true,
  ...overrides,
})

describe('synthesizeOrphanClusters', () => {
  it('renames clusterless hosts to "(no cluster) <hostName>"', () => {
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01' }), host({ hostName: 'esx-02' })],
      vinfo: [],
    })
    expect(out.vhost.map((h) => h.cluster)).toEqual(['(no cluster) esx-01', '(no cluster) esx-02'])
  })

  it('leaves hosts with a real cluster untouched', () => {
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01', cluster: 'CL_PROD' }), host({ hostName: 'esx-02' })],
      vinfo: [],
    })
    expect(out.vhost[0]?.cluster).toBe('CL_PROD')
    expect(out.vhost[1]?.cluster).toBe('(no cluster) esx-02')
  })

  it('passes hosts with empty hostName straight through (defensive)', () => {
    // No identifying info → cannot synthesize a name. Defensive filter
    // in the aggregator will drop the row.
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: '', cluster: '' })],
      vinfo: [],
    })
    expect(out.vhost[0]?.cluster).toBe('')
    expect(out.vhost[0]?.hostName).toBe('')
  })

  it('attributes orphan VMs to their host via the new host field', () => {
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01' }), host({ hostName: 'esx-02' })],
      vinfo: [
        vm({ vmName: 'vm-a', host: 'esx-01' }),
        vm({ vmName: 'vm-b', host: 'esx-02' }),
        vm({ vmName: 'vm-c', host: 'esx-02' }),
      ],
    })
    expect(out.vinfo.map((v) => [v.vmName, v.cluster])).toEqual([
      ['vm-a', '(no cluster) esx-01'],
      ['vm-b', '(no cluster) esx-02'],
      ['vm-c', '(no cluster) esx-02'],
    ])
  })

  it('leaves orphan VMs whose host is unknown alone', () => {
    // Live Optics today: host field is `''` on the VM row. Such VMs
    // are unattributable and stay orphan; aggregation drops them, same
    // as the pre-ADR-0014 behaviour.
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01' })],
      vinfo: [vm({ vmName: 'lo-vm', host: '' }), vm({ vmName: 'lo-vm-2', host: 'esx-unknown' })],
    })
    expect(out.vinfo[0]?.cluster).toBe('')
    expect(out.vinfo[1]?.cluster).toBe('')
  })

  it('leaves VMs that already have a real cluster untouched', () => {
    const out = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01' })],
      vinfo: [vm({ vmName: 'vm-prod', cluster: 'CL_PROD', host: 'esx-01' })],
    })
    expect(out.vinfo[0]?.cluster).toBe('CL_PROD')
  })

  it('is idempotent — a second pass changes nothing', () => {
    const first = synthesizeOrphanClusters({
      vhost: [host({ hostName: 'esx-01' })],
      vinfo: [vm({ host: 'esx-01' })],
    })
    const second = synthesizeOrphanClusters(first)
    expect(second.vhost).toEqual(first.vhost)
    expect(second.vinfo).toEqual(first.vinfo)
  })

  it('does not mutate the input arrays or rows', () => {
    const hosts: VHostRow[] = [host({ hostName: 'esx-01' })]
    const vms: VInfoRow[] = [vm({ host: 'esx-01' })]
    const hostsBefore = JSON.parse(JSON.stringify(hosts))
    const vmsBefore = JSON.parse(JSON.stringify(vms))
    synthesizeOrphanClusters({ vhost: hosts, vinfo: vms })
    expect(hosts).toEqual(hostsBefore)
    expect(vms).toEqual(vmsBefore)
  })

  it('handles a fully-clustered dataset as a pass-through', () => {
    const hosts = [host({ hostName: 'esx-01', cluster: 'CL_A' })]
    const vms = [vm({ vmName: 'vm-prod', cluster: 'CL_A', host: 'esx-01' })]
    const out = synthesizeOrphanClusters({ vhost: hosts, vinfo: vms })
    expect(out.vhost).toEqual(hosts)
    // Hot-path optimisation: when no orphans exist, the same array
    // reference is returned (no clone). Stable contract.
    expect(out.vinfo).toBe(vms)
  })
})
