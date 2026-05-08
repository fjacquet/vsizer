import type { VHostRow, VInfoRow } from '../../../types'
import type { ParsedSheet, ParsedWorkbook } from '../parseXlsx'
import { findSheet, mapColumns, readCol, readNumber, readString, toRatio } from './columnMap'

/**
 * Live Optics column aliases. Live Optics workbooks use longer, more
 * descriptive headers than RVTools and ship by default in English. The
 * ratio columns are typically already in 0..100 percent form (we route
 * them through `toRatio`).
 *
 * V1 covers the columns the dashboard actually consumes; extend as the UI
 * grows new fields.
 */
const VINFO_COLS = {
  vmName: ['vm name', 'vmname', 'name'],
  cluster: ['cluster', 'cluster name'],
  vcpu: ['vcpu', 'vcpus', 'configured vcpus', 'cpu'],
  vramMb: ['memory (mb)', 'memory mb', 'allocated memory (mb)', 'memory'],
  activeMemMb: ['active memory (mb)', 'memory active (mb)', 'active memory'],
  poweredOn: ['power state', 'powerstate', 'power status', 'state'],
} as const

const VHOST_COLS = {
  hostName: ['host name', 'hostname', 'host', 'esxi host'],
  cluster: ['cluster', 'cluster name'],
  cores: ['cores', 'core count', 'physical cores', 'logical processors'],
  speedMhz: ['cpu speed (mhz)', 'cpu mhz', 'speed (mhz)', 'processor speed'],
  cpuRatio: ['cpu utilization %', 'cpu utilization', 'cpu usage %', 'avg cpu %'],
  ramRatio: ['memory utilization %', 'memory utilization', 'memory usage %', 'avg memory %'],
} as const

const isPoweredOn = (raw: string): boolean => {
  const v = raw.toLowerCase().trim()
  return v === 'poweredon' || v === 'powered on' || v === 'on' || v === 'running'
}

export const adaptLiveOpticsVInfo = (sheet: ParsedSheet): VInfoRow[] => {
  const cols = mapColumns(sheet.headers, VINFO_COLS)
  return sheet.rows.map((row) => {
    const activeRaw = readCol(row, cols.activeMemMb)
    return {
      vmName: readString(readCol(row, cols.vmName)),
      cluster: readString(readCol(row, cols.cluster)),
      vcpu: Math.max(0, Math.trunc(readNumber(readCol(row, cols.vcpu)))),
      vramMb: Math.max(0, readNumber(readCol(row, cols.vramMb))),
      // Active-memory cells are blank for VMs that don't report it; preserve
      // null rather than coercing to 0 so the dashboard can show "—".
      activeMemMb: activeRaw == null ? null : readNumber(activeRaw),
      poweredOn: isPoweredOn(readString(readCol(row, cols.poweredOn))),
    }
  })
}

export const adaptLiveOpticsVHost = (sheet: ParsedSheet): VHostRow[] => {
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

export const adaptLiveOptics = (
  workbook: ParsedWorkbook,
): { vinfo: VInfoRow[]; vhost: VHostRow[] } => {
  const vinfoSheet = findSheet(workbook, ['vm inventory'])
  const vhostSheet = findSheet(workbook, ['host inventory'])
  return {
    vinfo: vinfoSheet ? adaptLiveOpticsVInfo(vinfoSheet) : [],
    vhost: vhostSheet ? adaptLiveOpticsVHost(vhostSheet) : [],
  }
}
