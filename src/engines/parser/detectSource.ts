import type { ParsedWorkbook } from './parseXlsx'

/**
 * Origin of an uploaded workbook. `unknown` means we can't confidently route
 * to either adapter — the UI should fall back to the manual mapping panel.
 */
export type SourceFormat = 'rvtools' | 'liveoptics' | 'unknown'

const norm = (s: string): string => s.toLowerCase().trim()

/**
 * Identify the export tool by sheet-name fingerprint. Order matters: the
 * RVTools check runs first because RVTools workbooks may contain a sheet
 * literally called "VM Inventory" in some translated builds, but never
 * "vInfo"+"vHost" together with that.
 *
 * V1 only inspects sheet names; we look at column headers in the adapter
 * itself when we need to disambiguate further.
 */
export const detectSource = ({ sheets }: ParsedWorkbook): SourceFormat => {
  const names = [...sheets.keys()].map(norm)

  const hasRvtools =
    names.some((n) => n === 'vinfo' || n.startsWith('vinfo')) &&
    names.some((n) => n === 'vhost' || n.startsWith('vhost'))
  if (hasRvtools) return 'rvtools'

  const hasLiveOptics = names.includes('vm inventory') && names.includes('host inventory')
  if (hasLiveOptics) return 'liveoptics'

  return 'unknown'
}
