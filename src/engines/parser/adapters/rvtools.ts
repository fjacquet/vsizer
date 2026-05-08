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
  poweredOn: ['powerstate', 'power state', 'état', 'status'],
} as const

const VHOST_COLS = {
  hostName: ['host', 'host name', 'hostname', 'nom hôte'],
  cluster: ['cluster', 'grappe'],
  cores: ['# cores', 'cores', 'core count', 'cœurs'],
  speedMhz: ['speed', 'speed (mhz)', 'cpu speed', 'vitesse'],
  cpuRatio: ['# cpu usage %', 'cpu usage %', 'cpu %', 'cpu usage', 'cpu use %'],
  ramRatio: ['# mem usage %', 'mem usage %', 'memory %', 'mem usage', 'mem use %'],
} as const

/**
 * Parse an RVTools `vInfo` sheet into canonical `VInfoRow`s. Cells that
 * don't parse cleanly (missing column, non-numeric input) collapse to
 * sensible neutrals (`0`, `''`, `null`) — the schema validator at the
 * `normalizeColumns` boundary is the gate for whether a row is acceptable.
 */
export const adaptRvtoolsVInfo = (sheet: ParsedSheet): VInfoRow[] => {
  const cols = mapColumns(sheet.headers, VINFO_COLS)
  return sheet.rows.map((row) => ({
    vmName: readString(readCol(row, cols.vmName)),
    cluster: readString(readCol(row, cols.cluster)),
    vcpu: Math.max(0, Math.trunc(readNumber(readCol(row, cols.vcpu)))),
    vramMb: Math.max(0, readNumber(readCol(row, cols.vramMb))),
    activeMemMb: null,
    poweredOn: readString(readCol(row, cols.poweredOn)).toLowerCase() === 'poweredon',
  }))
}

export const adaptRvtoolsVHost = (sheet: ParsedSheet): VHostRow[] => {
  const cols = mapColumns(sheet.headers, VHOST_COLS)
  return sheet.rows.map((row) => ({
    hostName: readString(readCol(row, cols.hostName)),
    cluster: readString(readCol(row, cols.cluster)),
    cores: Math.max(1, Math.trunc(readNumber(readCol(row, cols.cores)))),
    speedMhz: Math.max(1, readNumber(readCol(row, cols.speedMhz))),
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
  const vinfoSheet = findSheet(workbook, ['vinfo'])
  const vhostSheet = findSheet(workbook, ['vhost'])
  return {
    vinfo: vinfoSheet ? adaptRvtoolsVInfo(vinfoSheet) : [],
    vhost: vhostSheet ? adaptRvtoolsVHost(vhostSheet) : [],
  }
}
