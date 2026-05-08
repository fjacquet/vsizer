import type { ParsedSheet, ParsedWorkbook } from '../parseXlsx'

/**
 * Helpers shared by every adapter (RVTools, Live Optics, future formats).
 * Kept format-agnostic on purpose — they only know about headers, cells, and
 * type coercion, not about cluster layouts or VM semantics.
 */

/**
 * Locate the original (case-preserving) header that matches one of the given
 * aliases. Aliases are matched case- and whitespace-insensitively. Returns
 * `undefined` when nothing matches; the caller decides whether the column is
 * mandatory.
 */
export const findColumn = (headers: string[], aliases: readonly string[]): string | undefined => {
  const lowered = headers.map((h) => h.toLowerCase().trim())
  for (const alias of aliases) {
    const i = lowered.indexOf(alias.toLowerCase().trim())
    if (i !== -1) return headers[i]
  }
  return undefined
}

/**
 * Resolve every alias group of an adapter's column map at once. Returns a
 * dictionary of canonical key → original header (or `undefined` if missing).
 */
export const mapColumns = <T extends Record<string, readonly string[]>>(
  headers: string[],
  cols: T,
): { [K in keyof T]: string | undefined } => {
  const out = {} as { [K in keyof T]: string | undefined }
  for (const key in cols) {
    const aliases = cols[key]
    out[key] = aliases ? findColumn(headers, aliases) : undefined
  }
  return out
}

/**
 * Locate the first sheet whose name (lower-cased, trimmed) starts with one
 * of the given prefixes. Returns the sheet itself, not just the name.
 */
export const findSheet = (
  workbook: ParsedWorkbook,
  prefixes: readonly string[],
): ParsedSheet | undefined => {
  const candidates = prefixes.map((p) => p.toLowerCase().trim())
  for (const [name, sheet] of workbook.sheets) {
    const n = name.toLowerCase().trim()
    if (candidates.some((c) => n === c || n.startsWith(c))) return sheet
  }
  return undefined
}

/**
 * Read a cell from a row given its (possibly missing) original header name.
 * Returns `null` when the column wasn't found in the workbook so callers
 * don't have to repeat the `cols.foo ?? ''` defensive pattern at every
 * field — that makes branch coverage trivial and intent obvious.
 */
export const readCol = (row: Record<string, unknown>, col: string | undefined): unknown =>
  col === undefined ? null : row[col]

/**
 * Coerce a cell value to a number. Strips locale separators (` `, `,`, `'`)
 * and a trailing `%`. Returns `0` rather than `NaN` so adapter output always
 * satisfies the schema's non-negativity constraints — invalid inputs surface
 * as zeros that aggregation can ignore.
 */
export const readNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const cleaned = v.replace(/[\s']/g, '').replace(/%$/, '').replace(',', '.')
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/**
 * Coerce a cell value to a trimmed string. `null` and `undefined` become the
 * empty string so callers can pattern-match without optional chaining.
 */
export const readString = (v: unknown): string => (v == null ? '' : String(v).trim())

/**
 * Convert a percentage value to a 0..1 ratio defensively. Some sources
 * already store ratios (0.234), others percentages (23.4); we infer from
 * magnitude. Values >1.5 are treated as percentages and divided by 100.
 */
export const toRatio = (n: number): number => (n > 1.5 ? n / 100 : n)
