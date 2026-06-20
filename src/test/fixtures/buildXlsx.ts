import * as XLSX from 'xlsx'

/**
 * Builds an in-memory XLSX `ArrayBuffer` from a map of sheet name → rows
 * (rows are arrays-of-arrays, with the first row treated as the header).
 *
 * Used by parser tests so we don't ship binary fixture files in the repo.
 * Round-tripping through SheetJS also exercises the same code path the
 * production parser uses.
 */
export const buildXlsxBuffer = (
  sheets: Record<string, ReadonlyArray<ReadonlyArray<unknown>>>,
): ArrayBuffer => {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => [...r]))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  // SheetJS may return either a `Uint8Array` or a `number[]` for type:'array'
  // depending on the environment — coerce to a fresh Uint8Array first, then
  // detach the underlying buffer so the parser can read it independently.
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array | number[]
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/**
 * Builds a minimal RVTools-shaped XLSX with one cluster so `ingestDataset`
 * returns a valid `IngestResult` suitable for engine-level tests.
 */
export const buildRvToolsXlsx = (): ArrayBuffer =>
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
