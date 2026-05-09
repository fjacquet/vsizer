import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../test/fixtures/buildXlsx'
import { detectSource } from './detectSource'
import { parseXlsx } from './parseXlsx'

const wb = (sheets: Record<string, ReadonlyArray<ReadonlyArray<unknown>>>) =>
  parseXlsx(buildXlsxBuffer(sheets))

describe('detectSource', () => {
  it('identifies an RVTools workbook (vInfo + vHost)', () => {
    expect(detectSource(wb({ vInfo: [['VM']], vHost: [['Host']] }))).toBe('rvtools')
  })

  it('matches RVTools sheets case-insensitively', () => {
    expect(detectSource(wb({ VINFO: [['VM']], vhost: [['Host']] }))).toBe('rvtools')
  })

  it('identifies a Live Optics workbook', () => {
    expect(
      detectSource(
        wb({
          'VM Inventory': [['VMName']],
          'Host Inventory': [['Host Name']],
        }),
      ),
    ).toBe('liveoptics')
  })

  it('matches Live Optics sheets case-insensitively', () => {
    expect(
      detectSource(
        wb({
          'vm inventory': [['VMName']],
          'HOST INVENTORY': [['Host Name']],
        }),
      ),
    ).toBe('liveoptics')
  })

  it('returns "unknown" for an unrelated workbook', () => {
    expect(detectSource(wb({ Sheet1: [['foo']] }))).toBe('unknown')
  })

  it('returns "unknown" when only one expected sheet is present', () => {
    expect(detectSource(wb({ vInfo: [['VM']] }))).toBe('unknown')
  })

  it('identifies an RVTools workbook with "RVTools_tab*"-prefixed sheets', () => {
    // Some RVTools builds (or post-processed exports) keep the internal
    // table names as sheet names: RVTools_tabvInfo / RVTools_tabvHost.
    expect(detectSource(wb({ RVTools_tabvInfo: [['VM']], RVTools_tabvHost: [['Host']] }))).toBe(
      'rvtools',
    )
  })

  it('also identifies "RVTools_tab*"-prefixed sheets with trailing suffixes', () => {
    // A merged or post-processed combined export may suffix the table
    // name (`RVTools_tabvInfo_v2`, `RVTools_tabvHost-extras`). Match the
    // prefix the same way the canonical `vinfo` / `vhost` matcher does.
    expect(
      detectSource(wb({ RVTools_tabvInfo_v2: [['VM']], 'RVTools_tabvHost-extras': [['Host']] })),
    ).toBe('rvtools')
  })

  it('identifies the modern Live Optics format ("VMs" + "ESX Hosts")', () => {
    // Dell Live Optics exports from 2025+ use compact sheet names instead
    // of "VM Inventory" / "Host Inventory".
    expect(detectSource(wb({ VMs: [['VM Name']], 'ESX Hosts': [['Host Name']] }))).toBe(
      'liveoptics',
    )
  })

  it('matches the modern Live Optics sheet names case-insensitively', () => {
    expect(detectSource(wb({ vms: [['VM Name']], 'esx hosts': [['Host Name']] }))).toBe(
      'liveoptics',
    )
  })
})
