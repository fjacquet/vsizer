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
  // Physical host memory. Live Optics typically uses "Memory (MB)" or
  // "Total Memory (MB)" on the Host Inventory sheet.
  memoryMb: ['memory (mb)', 'total memory (mb)', 'memory mb', 'host memory (mb)'],
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
    memoryMb: Math.max(0, readNumber(readCol(row, cols.memoryMb))),
    cpuRatio: toRatio(readNumber(readCol(row, cols.cpuRatio))),
    ramRatio: toRatio(readNumber(readCol(row, cols.ramRatio))),
  }))
}

// ----------------------------------------------------------------------
// Modern Live Optics layout (Dell exports from 2025+).
//
// The compact format splits into multiple sheets:
//   * `VMs`              – static VM config; carries `Used Memory (active) (MiB)`
//                          so we don't need to join `VM Performance` for V1.
//   * `ESX Hosts`        – static host config. Clock speed is in **GHz**, host
//                          memory in **KiB** — both must be converted.
//   * `ESX Performance`  – per-host utilization (`Average CPU %` /
//                          `Average Memory %`). Joined to `ESX Hosts` by
//                          host name. Missing → ratios fall back to 0.
//
// The classic and modern adapters share the same canonical row shapes
// (`VInfoRow` / `VHostRow`), so downstream engines don't need to know
// which layout was on disk.
// ----------------------------------------------------------------------

const VINFO_MODERN_COLS = {
  vmName: ['vm name'],
  cluster: ['cluster'],
  vcpu: ['virtual cpu', 'vcpu', 'vcpus'],
  vramMb: ['provisioned memory (mib)', 'memory (mib)', 'memory (mb)'],
  // Active-memory cell on the VMs sheet. Blank cells are preserved as
  // null so the dashboard renders "—" rather than 0.
  activeMemMb: ['used memory (active) (mib)', 'active memory (mib)', 'active memory (mb)'],
  poweredOn: ['power state', 'powerstate'],
} as const

const VHOST_MODERN_COLS = {
  hostName: ['host name'],
  cluster: ['cluster'],
  cores: ['cpu cores', 'cores', '# cores'],
  // Speed columns: GHz form must be multiplied by 1000; we capture each
  // unit separately so the consumer can pick the right one.
  speedGhz: ['cpu clock speed (ghz)'],
  speedMhz: ['cpu clock speed (mhz)', 'speed (mhz)', 'cpu mhz'],
  // Memory columns: KiB form must be divided by 1024.
  memoryKib: ['memory (kib)'],
  memoryMib: ['memory (mib)', 'total memory (mib)', 'host memory (mib)'],
} as const

const PERF_COLS = {
  hostName: ['host', 'host name'],
  cpuRatio: ['average cpu %', 'avg cpu %'],
  ramRatio: ['average memory %', 'avg memory %'],
} as const

export const adaptLiveOpticsModernVInfo = (sheet: ParsedSheet): VInfoRow[] => {
  const cols = mapColumns(sheet.headers, VINFO_MODERN_COLS)
  return sheet.rows.map((row) => {
    const activeRaw = readCol(row, cols.activeMemMb)
    return {
      vmName: readString(readCol(row, cols.vmName)),
      cluster: readString(readCol(row, cols.cluster)),
      vcpu: Math.max(0, Math.trunc(readNumber(readCol(row, cols.vcpu)))),
      vramMb: Math.max(0, readNumber(readCol(row, cols.vramMb))),
      activeMemMb: activeRaw == null ? null : readNumber(activeRaw),
      poweredOn: isPoweredOn(readString(readCol(row, cols.poweredOn))),
    }
  })
}

/**
 * Build a hostName → { cpuRatio, ramRatio } lookup from the ESX Performance
 * sheet. Returns an empty map when the sheet is absent so the caller can
 * uniformly call `lookup.get(host) ?? { cpuRatio: 0, ramRatio: 0 }`.
 */
const buildPerfLookup = (
  sheet: ParsedSheet | undefined,
): Map<string, { cpuRatio: number; ramRatio: number }> => {
  const lookup = new Map<string, { cpuRatio: number; ramRatio: number }>()
  if (!sheet) return lookup
  const cols = mapColumns(sheet.headers, PERF_COLS)
  for (const row of sheet.rows) {
    const name = readString(readCol(row, cols.hostName))
    if (!name) continue
    lookup.set(name, {
      cpuRatio: toRatio(readNumber(readCol(row, cols.cpuRatio))),
      ramRatio: toRatio(readNumber(readCol(row, cols.ramRatio))),
    })
  }
  return lookup
}

export const adaptLiveOpticsModernVHost = (
  hostsSheet: ParsedSheet,
  perfSheet: ParsedSheet | undefined,
): VHostRow[] => {
  const cols = mapColumns(hostsSheet.headers, VHOST_MODERN_COLS)
  const perf = buildPerfLookup(perfSheet)
  return hostsSheet.rows.map((row) => {
    const hostName = readString(readCol(row, cols.hostName))
    // Prefer MHz when present; otherwise convert GHz → MHz. Floor at 1
    // to satisfy the schema (positive number).
    const speedMhzRaw = readNumber(readCol(row, cols.speedMhz))
    const speedGhzRaw = readNumber(readCol(row, cols.speedGhz))
    const speedMhz = speedMhzRaw > 0 ? speedMhzRaw : speedGhzRaw * 1000
    // Prefer MiB when present; otherwise convert KiB → MiB.
    const memoryMibRaw = readNumber(readCol(row, cols.memoryMib))
    const memoryKibRaw = readNumber(readCol(row, cols.memoryKib))
    const memoryMb = memoryMibRaw > 0 ? memoryMibRaw : memoryKibRaw / 1024
    const ratios = perf.get(hostName) ?? { cpuRatio: 0, ramRatio: 0 }
    return {
      hostName,
      cluster: readString(readCol(row, cols.cluster)),
      cores: Math.max(1, Math.trunc(readNumber(readCol(row, cols.cores)))),
      speedMhz: Math.max(1, speedMhz),
      memoryMb: Math.max(0, memoryMb),
      cpuRatio: ratios.cpuRatio,
      ramRatio: ratios.ramRatio,
    }
  })
}

export const adaptLiveOptics = (
  workbook: ParsedWorkbook,
): { vinfo: VInfoRow[]; vhost: VHostRow[] } => {
  // Classic layout takes precedence when both are inexplicably present.
  const classicVm = findSheet(workbook, ['vm inventory'])
  const classicHost = findSheet(workbook, ['host inventory'])
  if (classicVm && classicHost) {
    return {
      vinfo: adaptLiveOpticsVInfo(classicVm),
      vhost: adaptLiveOpticsVHost(classicHost),
    }
  }

  const modernVm = findSheet(workbook, ['vms'])
  const modernHost = findSheet(workbook, ['esx hosts'])
  if (modernVm && modernHost) {
    const modernPerf = findSheet(workbook, ['esx performance'])
    return {
      vinfo: adaptLiveOpticsModernVInfo(modernVm),
      vhost: adaptLiveOpticsModernVHost(modernHost, modernPerf),
    }
  }

  // Partial workbook (e.g. only one of the two layouts present): degrade
  // gracefully like the classic path used to.
  return {
    vinfo: classicVm ? adaptLiveOpticsVInfo(classicVm) : [],
    vhost: classicHost ? adaptLiveOpticsVHost(classicHost) : [],
  }
}
