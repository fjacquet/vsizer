import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../../test/fixtures/buildXlsx'
import { parseXlsx } from '../parseXlsx'
import { adaptLiveOptics, adaptLiveOpticsVHost, adaptLiveOpticsVInfo } from './liveoptics'

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
          'CPU Utilization %',
          'Memory Utilization %',
        ],
        ['esx-01', 'CL_DEMO_1', 24, 2400, 30.9, 28.9],
        ['esx-02', 'CL_DEMO_1', 24, 2400, 25.1, 32.4],
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
  it('converts percent CPU/RAM to 0..1 ratios', () => {
    const wb = liveOpticsWorkbook()
    const sheet = wb.sheets.get('Host Inventory')
    if (!sheet) throw new Error('fixture missing Host Inventory')
    const rows = adaptLiveOpticsVHost(sheet)
    expect(rows[0]).toEqual({
      hostName: 'esx-01',
      cluster: 'CL_DEMO_1',
      cores: 24,
      speedMhz: 2400,
      cpuRatio: 0.309,
      ramRatio: 0.289,
    })
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
