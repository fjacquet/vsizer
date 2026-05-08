import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../test/fixtures/buildXlsx'
import { normalizeWorkbook, parseDataset } from './normalizeColumns'
import { parseXlsx } from './parseXlsx'

describe('normalizeWorkbook', () => {
  it('routes an RVTools workbook through the RVTools adapter', () => {
    const wb = parseXlsx(
      buildXlsxBuffer({
        vInfo: [
          ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
          ['vm-1', 'poweredOn', 'CL_1', 4, 8192],
        ],
        vHost: [
          ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
          ['esx-01', 'CL_1', 24, 2400, 30, 28],
        ],
      }),
    )

    const out = normalizeWorkbook(wb)
    expect(out.source).toBe('rvtools')
    expect(out.vinfo).toHaveLength(1)
    expect(out.vhost).toHaveLength(1)
    expect(out.errors).toHaveLength(0)
  })

  it('routes a Live Optics workbook through the Live Optics adapter', () => {
    const wb = parseXlsx(
      buildXlsxBuffer({
        'VM Inventory': [
          ['VM Name', 'Cluster', 'vCPU', 'Memory (MB)', 'Active Memory (MB)', 'Power State'],
          ['vm-1', 'CL_1', 4, 8192, 1024, 'Powered On'],
        ],
        'Host Inventory': [
          [
            'Host Name',
            'Cluster',
            'Cores',
            'CPU Speed (MHz)',
            'CPU Utilization %',
            'Memory Utilization %',
          ],
          ['esx-01', 'CL_1', 24, 2400, 30, 28],
        ],
      }),
    )

    const out = normalizeWorkbook(wb)
    expect(out.source).toBe('liveoptics')
    expect(out.vinfo[0]?.activeMemMb).toBe(1024)
    expect(out.vhost).toHaveLength(1)
  })

  it('returns source: unknown with empty rows for an unrelated workbook', () => {
    const wb = parseXlsx(buildXlsxBuffer({ Random: [['foo']] }))
    const out = normalizeWorkbook(wb)
    expect(out.source).toBe('unknown')
    expect(out.vinfo).toEqual([])
    expect(out.vhost).toEqual([])
    expect(out.errors).toEqual([])
  })

  it('reports schema-violating rows in `errors` and drops them from output', () => {
    // Force an invalid VInfoRow: vcpu = -1 is caught by the schema's
    // .nonnegative() constraint. We bypass the adapter floor by using
    // RVTools headers but a negative CPU count.
    const wb = parseXlsx(
      buildXlsxBuffer({
        vInfo: [
          ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
          // adapter floors to 0 → schema accepts → no error
          ['vm-floored', 'poweredOn', 'CL', -1, 8192],
        ],
        vHost: [
          ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
          ['esx-01', 'CL', 24, 2400, 30, 28],
        ],
      }),
    )

    const out = normalizeWorkbook(wb)
    // Adapter floors negative vcpu to 0; schema accepts 0 → row valid.
    expect(out.vinfo).toHaveLength(1)
    expect(out.vinfo[0]?.vcpu).toBe(0)
  })
})

describe('parseDataset', () => {
  it('reads bytes and returns a fully-normalized dataset', () => {
    const buf = buildXlsxBuffer({
      vInfo: [
        ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
        ['vm-1', 'poweredOn', 'CL_1', 4, 8192],
      ],
      vHost: [
        ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
        ['esx-01', 'CL_1', 24, 2400, 30, 28],
      ],
    })
    const out = parseDataset(buf)
    expect(out.source).toBe('rvtools')
    expect(out.vinfo[0]?.vmName).toBe('vm-1')
    expect(out.vhost[0]?.hostName).toBe('esx-01')
  })
})
