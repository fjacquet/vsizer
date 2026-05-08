import * as XLSX from 'xlsx'

/**
 * Normalized representation of a single sheet after SheetJS parsing.
 * Headers are trimmed but case is preserved (adapters lower-case for
 * matching). Rows are objects keyed by the trimmed header strings; missing
 * cells are `null` rather than `undefined` to keep downstream code from
 * having to disambiguate "absent" vs "blank".
 */
export interface ParsedSheet {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

export interface ParsedWorkbook {
  /** Sheets keyed by their original name, insertion order preserved. */
  sheets: Map<string, ParsedSheet>
}

/**
 * Reads a workbook from an `ArrayBuffer` (or `Uint8Array`) and returns a
 * format-agnostic representation. No locale or vendor-specific knowledge
 * lives here — that's the job of `detectSource` and the adapters.
 *
 * SheetJS's `XLSX.read` does the bulk of the work; we then convert each
 * sheet to an array-of-arrays so we can treat the first row as headers
 * regardless of merged cells or empty leading columns.
 */
export const parseXlsx = (buffer: ArrayBuffer | Uint8Array): ParsedWorkbook => {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const workbook = XLSX.read(data, { type: 'array' })

  const sheets = new Map<string, ParsedSheet>()
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name]
    if (!ws) continue

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    })

    if (aoa.length === 0) {
      sheets.set(name, { name, headers: [], rows: [] })
      continue
    }

    const headerRow = aoa[0] ?? []
    const bodyRows = aoa.slice(1)
    const headers = headerRow.map((h) => (h == null ? '' : String(h).trim()))

    const rows = bodyRows.map((row) => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        if (h.length === 0) return
        obj[h] = row[i] ?? null
      })
      return obj
    })

    sheets.set(name, { name, headers, rows })
  }

  return { sheets }
}
