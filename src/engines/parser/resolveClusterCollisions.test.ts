import { describe, expect, it } from 'vitest'
import type { VHostRow, VInfoRow } from '../../types'
import { resolveClusterCollisions } from './resolveClusterCollisions'

const host = (overrides: Partial<VHostRow> = {}): VHostRow => ({
  hostName: 'esx-01',
  cluster: 'CL_PROD',
  cores: 16,
  speedMhz: 2600,
  memoryMb: 262_144,
  cpuRatio: 0.3,
  ramRatio: 0.4,
  ...overrides,
})

const vm = (overrides: Partial<VInfoRow> = {}): VInfoRow => ({
  vmName: 'vm-1',
  cluster: 'CL_PROD',
  host: 'esx-01',
  vcpu: 2,
  vramMb: 4096,
  activeMemMb: null,
  cpuReadinessPercent: null,
  poweredOn: true,
  ...overrides,
})

describe('resolveClusterCollisions', () => {
  it('single file → identity (no rewrites)', () => {
    const out = resolveClusterCollisions([
      {
        filename: 'rvtools.xlsx',
        vhost: [host({ cluster: 'Prod-A' }), host({ hostName: 'esx-02', cluster: 'Prod-B' })],
        vinfo: [vm({ cluster: 'Prod-A' }), vm({ vmName: 'vm-2', cluster: 'Prod-B' })],
      },
    ])
    expect(out.vhost.map((h) => h.cluster)).toEqual(['Prod-A', 'Prod-B'])
    expect(out.vinfo.map((v) => v.cluster)).toEqual(['Prod-A', 'Prod-B'])
  })

  it('two files, no name collision → identity', () => {
    const out = resolveClusterCollisions([
      {
        filename: 'site-a.xlsx',
        vhost: [host({ cluster: 'Prod-A' })],
        vinfo: [vm({ cluster: 'Prod-A' })],
      },
      {
        filename: 'site-b.xlsx',
        vhost: [host({ cluster: 'Prod-B' })],
        vinfo: [vm({ cluster: 'Prod-B' })],
      },
    ])
    expect(out.vhost.map((h) => h.cluster)).toEqual(['Prod-A', 'Prod-B'])
    expect(out.vinfo.map((v) => v.cluster)).toEqual(['Prod-A', 'Prod-B'])
  })

  it("two files share a cluster name → both files' rows get rewritten with the source-filename suffix", () => {
    const out = resolveClusterCollisions([
      {
        filename: 'site-a.xlsx',
        vhost: [host({ hostName: 'a-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'a-vm-1', cluster: 'Prod-A' })],
      },
      {
        filename: 'site-b.xlsx',
        vhost: [host({ hostName: 'b-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'b-vm-1', cluster: 'Prod-A' })],
      },
    ])
    expect(out.vhost.map((h) => h.cluster)).toEqual(['Prod-A (site-a)', 'Prod-A (site-b)'])
    expect(out.vinfo.map((v) => v.cluster)).toEqual(['Prod-A (site-a)', 'Prod-A (site-b)'])
  })

  it('three files: two collide on "Prod-A", third has unique "Prod-B" → only colliding rows are suffixed', () => {
    const out = resolveClusterCollisions([
      {
        filename: 'site-a.xlsx',
        vhost: [host({ hostName: 'a-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'a-vm-1', cluster: 'Prod-A' })],
      },
      {
        filename: 'site-b.xlsx',
        vhost: [host({ hostName: 'b-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'b-vm-1', cluster: 'Prod-A' })],
      },
      {
        filename: 'site-c.xlsx',
        vhost: [host({ hostName: 'c-esx-01', cluster: 'Prod-B' })],
        vinfo: [vm({ vmName: 'c-vm-1', cluster: 'Prod-B' })],
      },
    ])
    expect(out.vhost.map((h) => h.cluster)).toEqual([
      'Prod-A (site-a)',
      'Prod-A (site-b)',
      'Prod-B',
    ])
    expect(out.vinfo.map((v) => v.cluster)).toEqual([
      'Prod-A (site-a)',
      'Prod-A (site-b)',
      'Prod-B',
    ])
  })

  it('VM whose cluster gets renamed picks up the matching suffix so host/VM join survives', () => {
    // Two files, both have a "Prod-A" cluster. A VM in file A must end
    // up matched to its file-A host row, not the file-B one.
    const out = resolveClusterCollisions([
      {
        filename: 'site-a.xlsx',
        vhost: [host({ hostName: 'a-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'a-vm-1', cluster: 'Prod-A', host: 'a-esx-01' })],
      },
      {
        filename: 'site-b.xlsx',
        vhost: [host({ hostName: 'b-esx-01', cluster: 'Prod-A' })],
        vinfo: [vm({ vmName: 'b-vm-1', cluster: 'Prod-A', host: 'b-esx-01' })],
      },
    ])
    const a = out.vinfo.find((v) => v.vmName === 'a-vm-1')
    const b = out.vinfo.find((v) => v.vmName === 'b-vm-1')
    expect(a?.cluster).toBe('Prod-A (site-a)')
    expect(b?.cluster).toBe('Prod-A (site-b)')
    // Host rows must share the renamed cluster names so aggregateClusters
    // can join across the suffixed names without ambiguity.
    expect(out.vhost.find((h) => h.hostName === 'a-esx-01')?.cluster).toBe('Prod-A (site-a)')
    expect(out.vhost.find((h) => h.hostName === 'b-esx-01')?.cluster).toBe('Prod-A (site-b)')
  })

  it('strips the workbook extension from the suffix for all accepted formats', () => {
    const out = resolveClusterCollisions([
      {
        filename: 'site-a.xlsx',
        vhost: [host({ cluster: 'Prod' })],
        vinfo: [],
      },
      {
        filename: 'site-b.xlsm',
        vhost: [host({ hostName: 'esx-02', cluster: 'Prod' })],
        vinfo: [],
      },
      {
        filename: 'site-c.csv',
        vhost: [host({ hostName: 'esx-03', cluster: 'Prod' })],
        vinfo: [],
      },
      {
        filename: 'site-d.zip',
        vhost: [host({ hostName: 'esx-04', cluster: 'Prod' })],
        vinfo: [],
      },
    ])
    expect(out.vhost.map((h) => h.cluster)).toEqual([
      'Prod (site-a)',
      'Prod (site-b)',
      'Prod (site-c)',
      'Prod (site-d)',
    ])
  })

  it('empty input → empty output', () => {
    const out = resolveClusterCollisions([])
    expect(out.vhost).toEqual([])
    expect(out.vinfo).toEqual([])
  })

  it('does not mutate the input arrays', () => {
    const fileA = {
      filename: 'a.xlsx',
      vhost: [host({ hostName: 'a-esx', cluster: 'Prod' })],
      vinfo: [vm({ cluster: 'Prod' })],
    }
    const fileB = {
      filename: 'b.xlsx',
      vhost: [host({ hostName: 'b-esx', cluster: 'Prod' })],
      vinfo: [vm({ vmName: 'vm-2', cluster: 'Prod' })],
    }
    resolveClusterCollisions([fileA, fileB])
    // Original cluster names in caller arrays untouched.
    expect(fileA.vhost[0]?.cluster).toBe('Prod')
    expect(fileA.vinfo[0]?.cluster).toBe('Prod')
    expect(fileB.vhost[0]?.cluster).toBe('Prod')
    expect(fileB.vinfo[0]?.cluster).toBe('Prod')
  })
})
