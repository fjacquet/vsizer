import type { VHostRow, VInfoRow } from '../../../types'
import type { ParsedSheet, ParsedWorkbook } from '../parseXlsx'
import { findSheet, mapColumns, readCol, readNumber, readString, toRatio } from './columnMap'

/**
 * RVTools `vInfo` column aliases — RVTools defaults are English; these maps
 * also accept the most common French and German translations of the official
 * Dell/Robware build, plus a couple of Live-Optics-style synonyms so a user
 * who renamed the sheet manually still parses cleanly.
 *
 * Add a new alias by appending to the list — the first match wins, and case
 * is normalised before comparison.
 */
const VINFO_COLS = {
  vmName: ['vm', 'vm name', 'name', 'nom de la vm', 'vm-name'],
  cluster: ['cluster', 'grappe'],
  vcpu: ['cpus', '# cpus', 'cpu', 'vcpu', 'vcpus'],
  vramMb: ['memory', 'memory (mb)', 'mem', 'mémoire'],
  // CPU Ready (%RDY snapshot from VMware quickStats), per ADR-0012.
  // The canonical RVTools 4.x header is "Overall Cpu Readiness"; the
  // other aliases are forgiving fallbacks for translated or
  // post-processed exports.
  cpuReadinessPercent: ['overall cpu readiness', '% cpu readiness', 'cpu readiness'],
  poweredOn: ['powerstate', 'power state', 'état', 'status'],
} as const

const VHOST_COLS = {
  hostName: ['host', 'host name', 'hostname', 'nom hôte'],
  cluster: ['cluster', 'grappe'],
  cores: ['# cores', 'cores', 'core count', 'cœurs'],
  speedMhz: ['speed', 'speed (mhz)', 'cpu speed', 'vitesse'],
  // Physical host memory in MB. RVTools default header is "# Memory".
  // Older builds use "Memory" (collides with vInfo column name in some
  // workbooks but is unambiguous within vHost). FR alias kept for
  // localized exports.
  memoryMb: ['# memory', 'memory', 'mémoire', 'mémoire (mo)', 'mem'],
  // RVTools' default vHost columns are "CPU usage %" and "Memory usage %"
  // (see .reference/build_pptx.py line 47-48). Earlier alias lists missed
  // the canonical RAM spelling and silently parsed 0% — fixed.
  cpuRatio: ['cpu usage %', '# cpu usage %', '% cpu', 'cpu %', 'cpu usage', 'cpu use %'],
  ramRatio: [
    'memory usage %',
    '# memory usage %',
    'mem usage %',
    '# mem usage %',
    '% memory',
    'memory %',
    'mem usage',
    'mem use %',
  ],
} as const

/**
 * Parse an RVTools `vInfo` sheet into canonical `VInfoRow`s. Cells that
 * don't parse cleanly (missing column, non-numeric input) collapse to
 * sensible neutrals (`0`, `''`, `null`) — the schema validator at the
 * `normalizeColumns` boundary is the gate for whether a row is acceptable.
 */
export const adaptRvtoolsVInfo = (sheet: ParsedSheet): VInfoRow[] => {
  const cols = mapColumns(sheet.headers, VINFO_COLS)
  return sheet.rows.map((row) => {
    // Preserve null when the column is absent (older RVTools build
    // without quickStats) or the cell is blank (powered-off VM, not
    // collected). Coercing blanks to 0 would defeat the asymmetric
    // contract documented in ADR-0012 §2 — the aggregator
    // distinguishes "no reporters" (null) from "reporter at zero".
    const readyRaw = readCol(row, cols.cpuReadinessPercent)
    return {
      vmName: readString(readCol(row, cols.vmName)),
      cluster: readString(readCol(row, cols.cluster)),
      vcpu: Math.max(0, Math.trunc(readNumber(readCol(row, cols.vcpu)))),
      vramMb: Math.max(0, readNumber(readCol(row, cols.vramMb))),
      activeMemMb: null,
      cpuReadinessPercent: readyRaw == null ? null : Math.max(0, readNumber(readyRaw)),
      poweredOn: readString(readCol(row, cols.poweredOn)).toLowerCase() === 'poweredon',
    }
  })
}

export const adaptRvtoolsVHost = (sheet: ParsedSheet): VHostRow[] => {
  const cols = mapColumns(sheet.headers, VHOST_COLS)
  return sheet.rows.map((row) => ({
    hostName: readString(readCol(row, cols.hostName)),
    cluster: readString(readCol(row, cols.cluster)),
    cores: Math.max(1, Math.trunc(readNumber(readCol(row, cols.cores)))),
    speedMhz: Math.max(1, readNumber(readCol(row, cols.speedMhz))),
    memoryMb: Math.max(0, readNumber(readCol(row, cols.memoryMb))),
    cpuRatio: toRatio(readNumber(readCol(row, cols.cpuRatio))),
    ramRatio: toRatio(readNumber(readCol(row, cols.ramRatio))),
  }))
}

/**
 * Adapt an entire RVTools workbook. Returns empty arrays for sheets that
 * are missing rather than throwing — the dashboard surfaces the gap; the
 * adapter doesn't decide what's fatal.
 */
export const adaptRvtools = (
  workbook: ParsedWorkbook,
): { vinfo: VInfoRow[]; vhost: VHostRow[] } => {
  // Accept both the canonical sheet names and the `RVTools_tab*` table-name
  // prefix that some builds and post-processed combined exports leave in
  // place. `findSheet` already uses startsWith semantics, so the alias list
  // here is a list of *prefixes*, not exact matches — keeps detectSource
  // and the adapter aligned.
  const vinfoSheet = findSheet(workbook, ['vinfo', 'rvtools_tabvinfo'])
  const vhostSheet = findSheet(workbook, ['vhost', 'rvtools_tabvhost'])
  return {
    vinfo: vinfoSheet ? adaptRvtoolsVInfo(vinfoSheet) : [],
    vhost: vhostSheet ? adaptRvtoolsVHost(vhostSheet) : [],
  }
}
