import type { VHostRow, VInfoRow } from '../../types'
import { adaptLiveOptics } from './adapters/liveoptics'
import { adaptRvtools } from './adapters/rvtools'
import { detectSource, type SourceFormat } from './detectSource'
import { type ParsedWorkbook, parseXlsx } from './parseXlsx'
import { VHostRowSchema, VInfoRowSchema } from './schemas'

/**
 * Outcome of running the parser against a user-provided workbook. The UI
 * branches on `source`: `unknown` triggers the manual mapping panel,
 * everything else feeds the dashboard. `errors` is empty unless a row
 * failed schema validation (e.g. a malformed cluster column).
 */
export interface ParsedDataset {
  source: SourceFormat
  vinfo: VInfoRow[]
  vhost: VHostRow[]
  /** Per-row validation errors. Use sparingly: V1 surfaces a count, not a
   *  drilldown, so the file remains usable even with a few bad rows. */
  errors: Array<{ sheet: 'vinfo' | 'vhost'; index: number; message: string }>
}

const validate = <T>(
  rows: unknown[],
  schema: {
    safeParse: (v: unknown) => { success: boolean; data?: T; error?: { message: string } }
  },
  sheet: 'vinfo' | 'vhost',
): { rows: T[]; errors: ParsedDataset['errors'] } => {
  const out: T[] = []
  const errors: ParsedDataset['errors'] = []
  rows.forEach((row, index) => {
    const result = schema.safeParse(row)
    if (result.success && result.data !== undefined) {
      out.push(result.data)
    } else {
      errors.push({ sheet, index, message: result.error?.message ?? 'invalid row' })
    }
  })
  return { rows: out, errors }
}

/**
 * Run the appropriate adapter against a parsed workbook and validate every
 * row against the canonical schema. Filters out rows that fail validation
 * — the dashboard never sees half-typed rows — and reports them via
 * `errors` so the UI can surface a "N rows skipped" badge.
 */
export const normalizeWorkbook = (workbook: ParsedWorkbook): ParsedDataset => {
  const source = detectSource(workbook)
  const raw =
    source === 'rvtools'
      ? adaptRvtools(workbook)
      : source === 'liveoptics'
        ? adaptLiveOptics(workbook)
        : { vinfo: [], vhost: [] }

  const vinfo = validate<VInfoRow>(raw.vinfo, VInfoRowSchema, 'vinfo')
  const vhost = validate<VHostRow>(raw.vhost, VHostRowSchema, 'vhost')

  return {
    source,
    vinfo: vinfo.rows,
    vhost: vhost.rows,
    errors: [...vinfo.errors, ...vhost.errors],
  }
}

/**
 * One-shot helper from raw bytes to validated rows. The store wires this
 * directly to the FileDropzone — see `useDatasetUpload` (Step 6).
 */
export const parseDataset = (buffer: ArrayBuffer | Uint8Array): ParsedDataset =>
  normalizeWorkbook(parseXlsx(buffer))
