import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../test/fixtures/buildXlsx'
import { detectSource } from './detectSource'
import { parseXlsx } from './parseXlsx'

const wb = (sheets: Record<string, ReadonlyArray<ReadonlyArray<unknown>>>) =>
  parseXlsx(buildXlsxBuffer(sheets))

describe('detectSource', () => {
  it('identifies an RVTools workbook (vInfo + vHost)', () => {
    expect(detectSource(wb({ vInfo: [['VM']], vHost: [['Host']] }))).toBe('rvtools')
  })

  it('matches RVTools sheets case-insensitively', () => {
    expect(detectSource(wb({ VINFO: [['VM']], vhost: [['Host']] }))).toBe('rvtools')
  })

  it('identifies a Live Optics workbook', () => {
    expect(
      detectSource(
        wb({
          'VM Inventory': [['VMName']],
          'Host Inventory': [['Host Name']],
        }),
      ),
    ).toBe('liveoptics')
  })

  it('matches Live Optics sheets case-insensitively', () => {
    expect(
      detectSource(
        wb({
          'vm inventory': [['VMName']],
          'HOST INVENTORY': [['Host Name']],
        }),
      ),
    ).toBe('liveoptics')
  })

  it('returns "unknown" for an unrelated workbook', () => {
    expect(detectSource(wb({ Sheet1: [['foo']] }))).toBe('unknown')
  })

  it('returns "unknown" when only one expected sheet is present', () => {
    expect(detectSource(wb({ vInfo: [['VM']] }))).toBe('unknown')
  })
})
