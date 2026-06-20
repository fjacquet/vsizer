import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../test/fixtures/buildXlsx'
import { ingestDataset, IngestError } from './ingest'

const rvtools = (): ArrayBuffer =>
  buildXlsxBuffer({
    vInfo: [
      ['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory'],
      ['vm-1', 'poweredOn', 'CL_1', 4, 8192],
    ],
    vHost: [
      ['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %'],
      ['esx-01', 'CL_1', 24, 2400, 30, 28],
    ],
  })

describe('ingestDataset', () => {
  it('produces aggregates + globals from one RVTools workbook', () => {
    const res = ingestDataset([{ name: 'estate.xlsx', bytes: rvtools() }])
    expect(res.source).toBe('rvtools')
    expect(Object.keys(res.aggregates).length).toBeGreaterThan(0)
    expect(res.globals).not.toBeNull()
    expect(res.sources[0]?.name).toBe('estate.xlsx')
  })

  it('throws IngestError when no file parses to a known source', () => {
    expect(() => ingestDataset([{ name: 'junk.xlsx', bytes: new Uint8Array([1, 2, 3]) }])).toThrow(
      IngestError,
    )
  })
})
