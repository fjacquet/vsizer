import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer } from '../../../test/fixtures/buildXlsx'
import { parseXlsx } from '../parseXlsx'
import {
  findColumn,
  findSheet,
  mapColumns,
  readCol,
  readNumber,
  readString,
  toRatio,
} from './columnMap'

describe('findColumn', () => {
  it('matches case-insensitively and preserves the original casing', () => {
    expect(findColumn(['VM Name', 'Cluster'], ['vm name'])).toBe('VM Name')
  })

  it('returns undefined when no alias matches', () => {
    expect(findColumn(['VM Name', 'Cluster'], ['hostname', 'host'])).toBeUndefined()
  })

  it('returns undefined for empty headers', () => {
    expect(findColumn([], ['vm name'])).toBeUndefined()
  })

  it('returns undefined when the alias list is empty', () => {
    expect(findColumn(['VM Name'], [])).toBeUndefined()
  })
})

describe('mapColumns', () => {
  it('resolves every key in one pass', () => {
    const headers = ['VM', 'Cluster', 'CPUs']
    const out = mapColumns(headers, {
      vm: ['vm', 'vm name'],
      cluster: ['cluster'],
      missing: ['nope'],
    })
    expect(out).toEqual({ vm: 'VM', cluster: 'Cluster', missing: undefined })
  })
})

describe('findSheet', () => {
  it('matches a sheet whose name starts with one of the prefixes', () => {
    const wb = parseXlsx(buildXlsxBuffer({ vInfo_v2: [['VM']] }))
    expect(findSheet(wb, ['vinfo'])?.name).toBe('vInfo_v2')
  })

  it('matches the exact name as well', () => {
    const wb = parseXlsx(buildXlsxBuffer({ 'VM Inventory': [['VMName']] }))
    expect(findSheet(wb, ['vm inventory'])?.name).toBe('VM Inventory')
  })

  it('returns undefined when nothing matches', () => {
    const wb = parseXlsx(buildXlsxBuffer({ Random: [['x']] }))
    expect(findSheet(wb, ['vinfo'])).toBeUndefined()
  })
})

describe('readCol', () => {
  it('returns null when the column header is undefined', () => {
    expect(readCol({ A: 'x' }, undefined)).toBeNull()
  })

  it('reads the value when the header exists', () => {
    expect(readCol({ A: 42 }, 'A')).toBe(42)
  })

  it('returns the raw value (including null) when the cell is blank', () => {
    expect(readCol({ A: null }, 'A')).toBeNull()
  })
})

describe('readNumber', () => {
  it('passes finite numbers through unchanged', () => {
    expect(readNumber(42)).toBe(42)
    expect(readNumber(-1.5)).toBe(-1.5)
  })

  it('treats non-finite numbers as 0', () => {
    expect(readNumber(Number.NaN)).toBe(0)
    expect(readNumber(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('coerces booleans to 0/1', () => {
    expect(readNumber(true)).toBe(1)
    expect(readNumber(false)).toBe(0)
  })

  it('parses numeric strings, stripping locale separators and trailing %', () => {
    expect(readNumber('1 234,5')).toBe(1234.5)
    expect(readNumber("12'345.6")).toBe(12345.6)
    expect(readNumber('25.5%')).toBe(25.5)
  })

  it('returns 0 for unparseable strings', () => {
    expect(readNumber('not a number')).toBe(0)
  })

  it('returns 0 for null and undefined', () => {
    expect(readNumber(null)).toBe(0)
    expect(readNumber(undefined)).toBe(0)
  })

  it('returns 0 for object values', () => {
    expect(readNumber({})).toBe(0)
  })
})

describe('readString', () => {
  it('returns the empty string for null and undefined', () => {
    expect(readString(null)).toBe('')
    expect(readString(undefined)).toBe('')
  })

  it('trims and stringifies non-null values', () => {
    expect(readString('  hello  ')).toBe('hello')
    expect(readString(42)).toBe('42')
    expect(readString(false)).toBe('false')
  })
})

describe('toRatio', () => {
  it('keeps already-normalized ratios untouched', () => {
    expect(toRatio(0.42)).toBe(0.42)
    expect(toRatio(1.2)).toBe(1.2)
  })

  it('divides percent-encoded values by 100', () => {
    expect(toRatio(42)).toBeCloseTo(0.42)
    expect(toRatio(100)).toBe(1)
  })
})
