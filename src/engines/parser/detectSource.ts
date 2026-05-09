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
 * RVTools is recognized either via its canonical sheet names (`vInfo` /
 * `vHost`) or via the `RVTools_tab*` table-name prefix that some builds
 * (and post-processed combined exports) leave behind. Live Optics is
 * recognized via the legacy long names (`VM Inventory` / `Host Inventory`)
 * **or** the modern compact names (`VMs` / `ESX Hosts`) shipped by Dell's
 * 2025+ exports — the adapter dispatches between the two layouts.
 *
 * V1 only inspects sheet names; we look at column headers in the adapter
 * itself when we need to disambiguate further.
 */
export const detectSource = ({ sheets }: ParsedWorkbook): SourceFormat => {
  const names = [...sheets.keys()].map(norm)

  const matchesVInfo = (n: string): boolean =>
    n === 'vinfo' || n.startsWith('vinfo') || n === 'rvtools_tabvinfo'
  const matchesVHost = (n: string): boolean =>
    n === 'vhost' || n.startsWith('vhost') || n === 'rvtools_tabvhost'
  const hasRvtools = names.some(matchesVInfo) && names.some(matchesVHost)
  if (hasRvtools) return 'rvtools'

  const hasLiveOpticsClassic = names.includes('vm inventory') && names.includes('host inventory')
  const hasLiveOpticsModern = names.includes('vms') && names.includes('esx hosts')
  if (hasLiveOpticsClassic || hasLiveOpticsModern) return 'liveoptics'

  return 'unknown'
}
