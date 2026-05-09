import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../test/fixtures/buildXlsx'
import { extractWorkbookBytes, ZipExtractError } from './extractWorkbook'

const xlsxBytes = (): Uint8Array =>
  new Uint8Array(buildXlsxBuffer({ vInfo: [['VM']], vHost: [['Host']] }))

const buildZip = (entries: Record<string, Uint8Array>): Uint8Array => zipSync(entries)

describe('extractWorkbookBytes', () => {
  it('returns the input untouched for a regular .xlsx upload', () => {
    const bytes = xlsxBytes()
    const out = extractWorkbookBytes(bytes, 'RVTools_export.xlsx')
    // Same buffer view; the function must not re-encode the workbook.
    expect(out).toBe(bytes)
  })

  it('extracts the *_VMWARE_*.xlsx file from a Dell Live Optics zip', () => {
    const vmware = xlsxBytes()
    const decoy = new TextEncoder().encode('not a workbook')
    const zip = buildZip({
      'LiveOptics_3225699_AIR_02_16_2026.pptx': decoy,
      'LiveOptics_3225699_AIR_02_16_2026.xlsx': decoy,
      'LiveOptics_3225699_GENERAL_02_16_2026.xlsx': decoy,
      'LiveOptics_3225699_PERF_02_16_2026.pptx': decoy,
      'LiveOptics_3225699_VMWARE_02_16_2026.xlsx': vmware,
    })
    const out = extractWorkbookBytes(zip, 'cluster-indus_03_23_2026.zip')
    // The bytes must round-trip identically — anything else means we
    // re-zipped on the way out and risk corrupting the workbook.
    expect(out.length).toBe(vmware.length)
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from(vmware.slice(0, 16)))
  })

  it('matches *_VMWARE_*.xlsx case-insensitively', () => {
    const vmware = xlsxBytes()
    const zip = buildZip({ 'foo_vmware_bar.XLSX': vmware })
    const out = extractWorkbookBytes(zip, 'archive.zip')
    expect(out.length).toBe(vmware.length)
  })

  it('falls back to a single .xlsx entry when no _VMWARE_ token is present', () => {
    const vmware = xlsxBytes()
    const zip = buildZip({
      'README.txt': new TextEncoder().encode('hello'),
      'export.xlsx': vmware,
    })
    const out = extractWorkbookBytes(zip, 'archive.zip')
    expect(out.length).toBe(vmware.length)
  })

  it('throws a ZipExtractError when the zip contains no .xlsx', () => {
    const zip = buildZip({
      'LiveOptics_AIR.pptx': new TextEncoder().encode('deck'),
      'README.txt': new TextEncoder().encode('hello'),
    })
    expect(() => extractWorkbookBytes(zip, 'archive.zip')).toThrow(ZipExtractError)
  })

  it('throws when the zip has multiple .xlsx and none match the VMware pattern', () => {
    const zip = buildZip({
      'a.xlsx': xlsxBytes(),
      'b.xlsx': xlsxBytes(),
    })
    expect(() => extractWorkbookBytes(zip, 'archive.zip')).toThrow(ZipExtractError)
  })

  it('rejects malformed zip archives with a clear ZipExtractError', () => {
    // Truncated / random bytes — fflate will throw mid-decoding.
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff])
    expect(() => extractWorkbookBytes(garbage, 'archive.zip')).toThrow(ZipExtractError)
  })

  it('decides routing by file extension, not by magic bytes', () => {
    // An xlsx is itself a zip, so a magic-byte sniff would mis-route it.
    // We must dispatch from the file name. A `.xlsx` file name with zip
    // magic bytes (which is what every xlsx looks like) must pass through.
    const bytes = xlsxBytes()
    const out = extractWorkbookBytes(bytes, 'something.XLSX')
    expect(out).toBe(bytes)
  })

  it('accepts ArrayBuffer input as well as Uint8Array', () => {
    const u8 = xlsxBytes()
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
    const out = extractWorkbookBytes(ab, 'sheet.xlsx')
    expect(out.byteLength).toBe(u8.byteLength)
  })
})
