import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../../test/fixtures/buildXlsx'
import { parseXlsx } from '../parseXlsx'
import { adaptRvtools, adaptRvtoolsVHost, adaptRvtoolsVInfo } from './rvtools'

const rvtoolsWorkbook = (overrides?: {
  vInfoRows?: ReadonlyArray<ReadonlyArray<unknown>>
  vHostRows?: ReadonlyArray<ReadonlyArray<unknown>>
}) =>
  parseXlsx(
    buildXlsxBuffer({
      vInfo: overrides?.vInfoRows ?? [
        ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
        ['vm-app-1', 'poweredOn', 'CL_DEMO_1', 4, 8192],
        ['vm-db-1', 'poweredOff', 'CL_DEMO_1', 8, 16384],
        ['vm-web-1', 'poweredOn', 'CL_DEMO_2', 2, 4096],
      ],
      vHost: overrides?.vHostRows ?? [
        ['Host', 'Cluster', '# Cores', 'Speed (MHz)', '# Memory', '# CPU usage %', '# Mem usage %'],
        ['esx-01', 'CL_DEMO_1', 24, 2400, 524288, 30.9, 28.9],
        ['esx-02', 'CL_DEMO_1', 24, 2400, 524288, 25.1, 32.4],
        ['esx-03', 'CL_DEMO_2', 16, 2200, 262144, 18.2, 22.5],
      ],
    }),
  )

describe('adaptRvtoolsVInfo', () => {
  it('maps the canonical English RVTools columns', () => {
    const wb = rvtoolsWorkbook()
    const sheet = wb.sheets.get('vInfo')
    if (!sheet) throw new Error('fixture missing vInfo')
    const rows = adaptRvtoolsVInfo(sheet)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      vmName: 'vm-app-1',
      cluster: 'CL_DEMO_1',
      vcpu: 4,
      vramMb: 8192,
      activeMemMb: null,
      poweredOn: true,
    })
    expect(rows[1]?.poweredOn).toBe(false)
  })

  it('tolerates French-localized column headers', () => {
    const wb = rvtoolsWorkbook({
      vInfoRows: [
        ['Nom de la VM', 'Status', 'Grappe', 'vCPU', 'Mémoire'],
        ['vm-fr', 'poweredOn', 'CL_FR', 6, 12288],
      ],
    })
    const sheet = wb.sheets.get('vInfo')
    if (!sheet) throw new Error('fixture missing vInfo')
    const rows = adaptRvtoolsVInfo(sheet)
    expect(rows[0]).toMatchObject({
      vmName: 'vm-fr',
      cluster: 'CL_FR',
      vcpu: 6,
      vramMb: 12288,
      poweredOn: true,
    })
  })
})

describe('adaptRvtoolsVHost', () => {
  it('maps the canonical English RVTools columns', () => {
    const wb = rvtoolsWorkbook()
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      hostName: 'esx-01',
      cluster: 'CL_DEMO_1',
      cores: 24,
      speedMhz: 2400,
      memoryMb: 524288,
      // 30.9 % → 0.309
      cpuRatio: 0.309,
      ramRatio: 0.289,
    })
  })

  it('passes ratios through untouched when already in 0..1 form', () => {
    const wb = rvtoolsWorkbook({
      vHostRows: [
        ['Host', 'Cluster', '# Cores', 'Speed', '# Memory', '# CPU usage %', '# Mem usage %'],
        ['esx-norm', 'CL_X', 12, 2100, 262144, 0.42, 0.18],
      ],
    })
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)
    expect(rows[0]?.cpuRatio).toBe(0.42)
    expect(rows[0]?.ramRatio).toBe(0.18)
  })

  it('clamps cores and speed to a minimum of 1 to satisfy the schema', () => {
    const wb = rvtoolsWorkbook({
      vHostRows: [
        ['Host', 'Cluster', '# Cores', 'Speed', '# Memory', '# CPU usage %', '# Mem usage %'],
        ['esx-bad', 'CL_X', 0, 0, 0, 25, 25],
      ],
    })
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)
    expect(rows[0]?.cores).toBe(1)
    expect(rows[0]?.speedMhz).toBe(1)
  })

  it('falls back to memoryMb=0 when the column is missing', () => {
    // Old RVTools build with no "# Memory" column.
    const wb = rvtoolsWorkbook({
      vHostRows: [
        ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
        ['esx-old', 'CL_X', 12, 2100, 25, 30],
      ],
    })
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)
    expect(rows[0]?.memoryMb).toBe(0)
  })

  it('reads RVTools canonical "CPU usage %" and "Memory usage %" headers (regression)', () => {
    // The legacy Python reference reads exactly these column names; an
    // earlier alias list missed "Memory usage %" and silently produced
    // ramRatio = 0 across the dashboard. Pin both spellings here.
    const wb = rvtoolsWorkbook({
      vHostRows: [
        ['Host', 'Cluster', '# Cores', 'Speed', '# Memory', 'CPU usage %', 'Memory usage %'],
        ['esx-canon', 'CL_X', 24, 2400, 524288, 32.5, 47.8],
      ],
    })
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)
    expect(rows[0]?.cpuRatio).toBeCloseTo(0.325, 4)
    expect(rows[0]?.ramRatio).toBeCloseTo(0.478, 4)
  })

  it('tolerates the FR alias "Mémoire"', () => {
    const wb = rvtoolsWorkbook({
      vHostRows: [
        ['Nom hôte', 'Grappe', 'Cœurs', 'Vitesse', 'Mémoire', '# CPU usage %', '# Mem usage %'],
        ['esx-fr', 'CL_FR', 12, 2100, 196608, 25, 30],
      ],
    })
    const sheet = wb.sheets.get('vHost')
    if (!sheet) throw new Error('fixture missing vHost')
    const rows = adaptRvtoolsVHost(sheet)
    expect(rows[0]?.memoryMb).toBe(196608)
  })
})

describe('adaptRvtools (orchestrator)', () => {
  it('returns both row sets for a complete workbook', () => {
    const result = adaptRvtools(rvtoolsWorkbook())
    expect(result.vinfo).toHaveLength(3)
    expect(result.vhost).toHaveLength(3)
  })

  it('returns empty arrays when the expected sheets are missing', () => {
    const wb = parseXlsx(buildXlsxBuffer({ Random: [['foo']] }))
    expect(adaptRvtools(wb)).toEqual({ vinfo: [], vhost: [] })
  })

  it('parses workbooks whose sheets carry the "RVTools_tab*" table-name prefix', () => {
    // Some RVTools builds and post-processed combined exports leave the
    // internal table names (RVTools_tabvInfo / RVTools_tabvHost) as sheet
    // names. The contents are unchanged, only the sheet labels differ.
    const wb = parseXlsx(
      buildXlsxBuffer({
        RVTools_tabvInfo: [
          ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
          ['vm-prefixed', 'poweredOn', 'CL_PFX', 4, 8192],
        ],
        RVTools_tabvHost: [
          ['Host', 'Cluster', '# Cores', 'Speed', '# Memory', 'CPU usage %', 'Memory usage %'],
          ['esx-pfx', 'CL_PFX', 24, 2400, 524288, 30.9, 28.9],
        ],
      }),
    )
    const out = adaptRvtools(wb)
    expect(out.vinfo).toHaveLength(1)
    expect(out.vhost).toHaveLength(1)
    expect(out.vinfo[0]?.vmName).toBe('vm-prefixed')
    expect(out.vhost[0]?.hostName).toBe('esx-pfx')
  })

  it('matches sheet names case-insensitively', () => {
    const wb = parseXlsx(
      buildXlsxBuffer({
        VINFO: [
          ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
          ['vm-1', 'poweredOn', 'CL', 2, 4096],
        ],
        vhost: [
          ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
          ['h-1', 'CL', 12, 2400, 25, 30],
        ],
      }),
    )
    const out = adaptRvtools(wb)
    expect(out.vinfo).toHaveLength(1)
    expect(out.vhost).toHaveLength(1)
  })
})
