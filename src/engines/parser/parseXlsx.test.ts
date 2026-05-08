import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../test/fixtures/buildXlsx'
import { parseXlsx } from './parseXlsx'

describe('parseXlsx', () => {
  it('parses a single-sheet workbook into header + rows', () => {
    const buf = buildXlsxBuffer({
      vInfo: [
        ['VM', 'Cluster', 'CPUs'],
        ['vm-1', 'CL_DEMO_1', 4],
        ['vm-2', 'CL_DEMO_2', 8],
      ],
    })

    const { sheets } = parseXlsx(buf)
    const vinfo = sheets.get('vInfo')
    expect(vinfo).toBeDefined()
    expect(vinfo?.headers).toEqual(['VM', 'Cluster', 'CPUs'])
    expect(vinfo?.rows).toHaveLength(2)
    expect(vinfo?.rows[0]).toEqual({ VM: 'vm-1', Cluster: 'CL_DEMO_1', CPUs: 4 })
  })

  it('preserves multiple sheets and their order', () => {
    const buf = buildXlsxBuffer({
      vInfo: [['VM']],
      vHost: [['Host']],
    })

    const { sheets } = parseXlsx(buf)
    expect([...sheets.keys()]).toEqual(['vInfo', 'vHost'])
  })

  it('trims header whitespace but keeps original case', () => {
    const buf = buildXlsxBuffer({
      Sheet1: [
        ['  VM Name  ', '  Cluster '],
        ['vm-1', 'CL'],
      ],
    })

    const { sheets } = parseXlsx(buf)
    const sheet = sheets.get('Sheet1')
    expect(sheet?.headers).toEqual(['VM Name', 'Cluster'])
    expect(sheet?.rows[0]).toEqual({ 'VM Name': 'vm-1', Cluster: 'CL' })
  })

  it('represents missing cells as null, not undefined', () => {
    const buf = buildXlsxBuffer({
      Sheet1: [
        ['A', 'B', 'C'],
        ['a1', null, 'c1'],
      ],
    })

    const { sheets } = parseXlsx(buf)
    expect(sheets.get('Sheet1')?.rows[0]).toEqual({ A: 'a1', B: null, C: 'c1' })
  })

  it('drops columns whose header is blank rather than emitting empty keys', () => {
    const buf = buildXlsxBuffer({
      Sheet1: [
        ['A', '', 'C'],
        ['a1', 'middle', 'c1'],
      ],
    })

    const { sheets } = parseXlsx(buf)
    const row = sheets.get('Sheet1')?.rows[0]
    expect(row).toEqual({ A: 'a1', C: 'c1' })
    expect(row && '' in row).toBe(false)
  })

  it('returns an empty sheet entry for an empty worksheet', () => {
    const buf = buildXlsxBuffer({ Empty: [] })
    const sheet = parseXlsx(buf).sheets.get('Empty')
    expect(sheet).toEqual({ name: 'Empty', headers: [], rows: [] })
  })
})
