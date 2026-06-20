import { describe, expect, it } from 'vitest'
import { buildRvToolsXlsx, buildXlsxBuffer } from '../test/fixtures/buildXlsx'
import { ingestDataset } from './ingest'

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
    expect(res.failedFiles).toEqual([])
  })

  it('throws IngestError with code NO_SOURCE when no file parses to a known source', () => {
    expect(() =>
      ingestDataset([{ name: 'junk.xlsx', bytes: new Uint8Array([1, 2, 3]) }]),
    ).toThrowError(expect.objectContaining({ code: 'NO_SOURCE' }))
  })

  it('throws IngestError with code NO_CLUSTERS when workbook has no cluster rows', () => {
    // Build a workbook that is recognized as rvtools but has no cluster data
    const emptyRvtools = buildXlsxBuffer({
      vInfo: [['VM', 'Powerstate', 'Cluster', 'CPUs', 'Memory']],
      vHost: [['Host', 'Cluster', '# Cores', 'Speed', '# CPU usage %', '# Mem usage %']],
    })
    expect(() => ingestDataset([{ name: 'empty.xlsx', bytes: emptyRvtools }])).toThrowError(
      expect.objectContaining({ code: 'NO_CLUSTERS' }),
    )
  })

  it('continues processing good files when first file triggers ZipExtractError', () => {
    const badZip = new Uint8Array([0x00, 0x01, 0x02, 0x03]) // junk bytes, not a real zip
    const goodFile = buildRvToolsXlsx()
    const res = ingestDataset([
      { name: 'bad.zip', bytes: badZip },
      { name: 'good.xlsx', bytes: goodFile },
    ])
    // Good file still produced clusters
    expect(Object.keys(res.aggregates).length).toBeGreaterThan(0)
    // Bad file reported in failedFiles with kind 'zip'
    expect(res.failedFiles).toHaveLength(1)
    expect(res.failedFiles[0]).toMatchObject({ file: 'bad.zip', kind: 'zip' })
  })

  it('throws IngestError NO_SOURCE when sole file is a bad zip', () => {
    const badZip = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    expect(() => ingestDataset([{ name: 'bad.zip', bytes: badZip }])).toThrowError(
      expect.objectContaining({ code: 'NO_SOURCE' }),
    )
  })
})
