import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../../test/fixtures/buildXlsx'
import { parseXlsx } from '../parseXlsx'
import {
  adaptLiveOptics,
  adaptLiveOpticsModernVHost,
  adaptLiveOpticsModernVInfo,
  adaptLiveOpticsVHost,
  adaptLiveOpticsVInfo,
} from './liveoptics'

const liveOpticsWorkbook = (overrides?: {
  vmRows?: ReadonlyArray<ReadonlyArray<unknown>>
  hostRows?: ReadonlyArray<ReadonlyArray<unknown>>
}) =>
  parseXlsx(
    buildXlsxBuffer({
      'VM Inventory': overrides?.vmRows ?? [
        ['VM Name', 'Cluster', 'vCPU', 'Memory (MB)', 'Active Memory (MB)', 'Power State'],
        ['vm-app-1', 'CL_DEMO_1', 4, 8192, 1024, 'Powered On'],
        ['vm-db-1', 'CL_DEMO_1', 8, 16384, null, 'Powered Off'],
        ['vm-web-1', 'CL_DEMO_2', 2, 4096, 512, 'On'],
      ],
      'Host Inventory': overrides?.hostRows ?? [
        [
          'Host Name',
          'Cluster',
          'Cores',
          'CPU Speed (MHz)',
          'Memory (MB)',
          'CPU Utilization %',
          'Memory Utilization %',
        ],
        ['esx-01', 'CL_DEMO_1', 24, 2400, 524288, 30.9, 28.9],
        ['esx-02', 'CL_DEMO_1', 24, 2400, 524288, 25.1, 32.4],
      ],
    }),
  )

describe('adaptLiveOpticsVInfo', () => {
  it('maps the canonical Live Optics VM Inventory columns', () => {
    const wb = liveOpticsWorkbook()
    const sheet = wb.sheets.get('VM Inventory')
    if (!sheet) throw new Error('fixture missing VM Inventory')
    const rows = adaptLiveOpticsVInfo(sheet)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      vmName: 'vm-app-1',
      cluster: 'CL_DEMO_1',
      vcpu: 4,
      vramMb: 8192,
      activeMemMb: 1024,
      poweredOn: true,
    })
  })

  it('preserves null activeMemMb when the source cell is blank', () => {
    const wb = liveOpticsWorkbook()
    const sheet = wb.sheets.get('VM Inventory')
    if (!sheet) throw new Error('fixture missing VM Inventory')
    const rows = adaptLiveOpticsVInfo(sheet)
    expect(rows[1]?.activeMemMb).toBeNull()
    expect(rows[1]?.poweredOn).toBe(false)
  })

  it('treats "On" / "running" as poweredOn', () => {
    const wb = liveOpticsWorkbook({
      vmRows: [
        ['VM Name', 'Cluster', 'vCPU', 'Memory (MB)', 'Active Memory (MB)', 'State'],
        ['vm-on', 'CL', 1, 1024, null, 'on'],
        ['vm-run', 'CL', 1, 1024, null, 'running'],
        ['vm-off', 'CL', 1, 1024, null, 'powered off'],
      ],
    })
    const sheet = wb.sheets.get('VM Inventory')
    if (!sheet) throw new Error('fixture missing VM Inventory')
    const rows = adaptLiveOpticsVInfo(sheet)
    expect(rows.map((r) => r.poweredOn)).toEqual([true, true, false])
  })
})

describe('adaptLiveOpticsVHost', () => {
  it('converts percent CPU/RAM to 0..1 ratios and reads memoryMb', () => {
    const wb = liveOpticsWorkbook()
    const sheet = wb.sheets.get('Host Inventory')
    if (!sheet) throw new Error('fixture missing Host Inventory')
    const rows = adaptLiveOpticsVHost(sheet)
    expect(rows[0]).toEqual({
      hostName: 'esx-01',
      cluster: 'CL_DEMO_1',
      cores: 24,
      speedMhz: 2400,
      memoryMb: 524288,
      cpuRatio: 0.309,
      ramRatio: 0.289,
    })
  })

  it('falls back to memoryMb=0 when the column is missing', () => {
    const wb = liveOpticsWorkbook({
      hostRows: [
        [
          'Host Name',
          'Cluster',
          'Cores',
          'CPU Speed (MHz)',
          'CPU Utilization %',
          'Memory Utilization %',
        ],
        ['esx-old', 'CL_X', 12, 2100, 25, 30],
      ],
    })
    const sheet = wb.sheets.get('Host Inventory')
    if (!sheet) throw new Error('fixture missing Host Inventory')
    const rows = adaptLiveOpticsVHost(sheet)
    expect(rows[0]?.memoryMb).toBe(0)
  })
})

describe('adaptLiveOptics (orchestrator)', () => {
  it('returns both row sets for a complete workbook', () => {
    const out = adaptLiveOptics(liveOpticsWorkbook())
    expect(out.vinfo).toHaveLength(3)
    expect(out.vhost).toHaveLength(2)
  })

  it('returns empty arrays when expected sheets are missing', () => {
    const wb = parseXlsx(buildXlsxBuffer({ Misc: [['foo']] }))
    expect(adaptLiveOptics(wb)).toEqual({ vinfo: [], vhost: [] })
  })
})

// -----------------------------------------------------------------------
// Modern Live Optics layout (Dell exports from 2025+).
//
// VMs               – static VM config (no utilization)
// VM Performance    – per-VM utilization (not consumed by V1: activeMemMb
//                     comes directly from VMs.`Used Memory (active) (MiB)`).
// ESX Hosts         – static host config; clock speed in GHz, memory in KiB
// ESX Performance   – per-host utilization (`Average CPU %`, `Average Memory %`)
// -----------------------------------------------------------------------

const modernWorkbook = (overrides?: {
  vms?: ReadonlyArray<ReadonlyArray<unknown>>
  hosts?: ReadonlyArray<ReadonlyArray<unknown>>
  esxPerf?: ReadonlyArray<ReadonlyArray<unknown>>
}) =>
  parseXlsx(
    buildXlsxBuffer({
      VMs: overrides?.vms ?? [
        [
          'MOB ID',
          'VM Name',
          'Power State',
          'Virtual CPU',
          'Provisioned Memory (MiB)',
          'Used Memory (active) (MiB)',
          'Cluster',
        ],
        ['vm-1', 'app-01', 'poweredOn', 4, 16384, 1802, 'CL_MOD'],
        ['vm-2', 'app-02', 'poweredOff', 8, 32768, null, 'CL_MOD'],
      ],
      'ESX Hosts': overrides?.hosts ?? [
        [
          'Host Name',
          'Cluster',
          'CPU Sockets',
          'CPU Cores',
          'CPU Clock Speed (GHz)',
          'Memory (KiB)',
        ],
        ['esx-mod-01.lab', 'CL_MOD', 1, 20, 2.5, 199_883_280],
      ],
      'ESX Performance': overrides?.esxPerf ?? [
        ['Host', 'Cluster', 'Average CPU %', 'Average Memory %'],
        ['esx-mod-01.lab', 'CL_MOD', 4, 33],
      ],
    }),
  )

describe('adaptLiveOpticsModernVInfo', () => {
  it('reads activeMemMb directly from "Used Memory (active) (MiB)"', () => {
    const wb = modernWorkbook()
    const sheet = wb.sheets.get('VMs')
    if (!sheet) throw new Error('fixture missing VMs')
    const rows = adaptLiveOpticsModernVInfo(sheet)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      vmName: 'app-01',
      cluster: 'CL_MOD',
      vcpu: 4,
      vramMb: 16384,
      activeMemMb: 1802,
      poweredOn: true,
    })
    expect(rows[1]?.poweredOn).toBe(false)
    expect(rows[1]?.activeMemMb).toBeNull()
  })
})

describe('adaptLiveOpticsModernVHost', () => {
  it('converts CPU clock speed from GHz to MHz and memory from KiB to MiB', () => {
    const wb = modernWorkbook()
    const hosts = wb.sheets.get('ESX Hosts')
    const perf = wb.sheets.get('ESX Performance')
    if (!hosts || !perf) throw new Error('fixture missing ESX sheets')
    const rows = adaptLiveOpticsModernVHost(hosts, perf)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      hostName: 'esx-mod-01.lab',
      cluster: 'CL_MOD',
      cores: 20,
      // 2.5 GHz × 1000 = 2500 MHz
      speedMhz: 2500,
      // 199 883 280 KiB / 1024 ≈ 195 198 MiB (rounded to MiB precision)
      memoryMb: 195198.515625,
      // 4 % → 0.04 ; 33 % → 0.33
      cpuRatio: 0.04,
      ramRatio: 0.33,
    })
  })

  it('joins ESX Performance to ESX Hosts by host name', () => {
    const wb = modernWorkbook({
      hosts: [
        ['Host Name', 'Cluster', 'CPU Cores', 'CPU Clock Speed (GHz)', 'Memory (KiB)'],
        ['esx-a.lab', 'CL_MOD', 12, 2.0, 134_217_728],
        ['esx-b.lab', 'CL_MOD', 12, 2.0, 134_217_728],
      ],
      esxPerf: [
        ['Host', 'Cluster', 'Average CPU %', 'Average Memory %'],
        ['esx-b.lab', 'CL_MOD', 50, 60],
        ['esx-a.lab', 'CL_MOD', 10, 20],
      ],
    })
    const hosts = wb.sheets.get('ESX Hosts')
    const perf = wb.sheets.get('ESX Performance')
    if (!hosts || !perf) throw new Error('fixture missing ESX sheets')
    const rows = adaptLiveOpticsModernVHost(hosts, perf)
    expect(rows.find((r) => r.hostName === 'esx-a.lab')?.cpuRatio).toBe(0.1)
    expect(rows.find((r) => r.hostName === 'esx-b.lab')?.cpuRatio).toBe(0.5)
  })

  it('joins ESX Performance to ESX Hosts case-insensitively (defensive)', () => {
    // Dell exports observed in 2026 use byte-identical FQDNs across both
    // sheets, but DNS hostnames are case-insensitive. A future build that
    // upper-cases on one sheet and lower-cases on the other must not
    // silently drop ratios to 0.
    const wb = modernWorkbook({
      hosts: [
        ['Host Name', 'Cluster', 'CPU Cores', 'CPU Clock Speed (GHz)', 'Memory (KiB)'],
        ['esx-A.LAB', 'CL_MOD', 12, 2.0, 134_217_728],
      ],
      esxPerf: [
        ['Host', 'Cluster', 'Average CPU %', 'Average Memory %'],
        // Same host, different case + trailing whitespace.
        ['  ESX-a.lab  ', 'CL_MOD', 25, 40],
      ],
    })
    const hosts = wb.sheets.get('ESX Hosts')
    const perf = wb.sheets.get('ESX Performance')
    if (!hosts || !perf) throw new Error('fixture missing ESX sheets')
    const rows = adaptLiveOpticsModernVHost(hosts, perf)
    expect(rows[0]?.cpuRatio).toBe(0.25)
    expect(rows[0]?.ramRatio).toBe(0.4)
  })

  it('falls back to cpuRatio=ramRatio=0 when ESX Performance is missing', () => {
    const wb = modernWorkbook()
    const hosts = wb.sheets.get('ESX Hosts')
    if (!hosts) throw new Error('fixture missing ESX Hosts')
    const rows = adaptLiveOpticsModernVHost(hosts, undefined)
    expect(rows[0]?.cpuRatio).toBe(0)
    expect(rows[0]?.ramRatio).toBe(0)
  })

  it('also accepts the legacy "Memory (MiB)" / "CPU Clock Speed (MHz)" headers', () => {
    const wb = modernWorkbook({
      hosts: [
        ['Host Name', 'Cluster', 'CPU Cores', 'CPU Clock Speed (MHz)', 'Memory (MiB)'],
        ['esx-legacy.lab', 'CL_MOD', 24, 2400, 524288],
      ],
      esxPerf: [
        ['Host', 'Cluster', 'Average CPU %', 'Average Memory %'],
        ['esx-legacy.lab', 'CL_MOD', 25, 50],
      ],
    })
    const hosts = wb.sheets.get('ESX Hosts')
    const perf = wb.sheets.get('ESX Performance')
    if (!hosts || !perf) throw new Error('fixture missing ESX sheets')
    const rows = adaptLiveOpticsModernVHost(hosts, perf)
    expect(rows[0]?.speedMhz).toBe(2400)
    expect(rows[0]?.memoryMb).toBe(524288)
  })
})

describe('adaptLiveOptics (modern orchestrator)', () => {
  it('routes to the modern layout when VMs + ESX Hosts are present', () => {
    const out = adaptLiveOptics(modernWorkbook())
    expect(out.vinfo).toHaveLength(2)
    expect(out.vhost).toHaveLength(1)
    expect(out.vhost[0]?.cpuRatio).toBe(0.04)
    expect(out.vhost[0]?.speedMhz).toBe(2500)
  })

  it('still routes to the classic layout when VM Inventory + Host Inventory are present', () => {
    const out = adaptLiveOptics(liveOpticsWorkbook())
    expect(out.vinfo).toHaveLength(3)
    expect(out.vhost).toHaveLength(2)
    // Classic fixture uses MHz + MiB directly.
    expect(out.vhost[0]?.speedMhz).toBe(2400)
  })
})
