/**
 * Locale-aware integer formatter. Returns an em-dash for non-finite inputs
 * so the dashboard can render placeholders without ad-hoc null guards.
 */
export const fmtInt = (n: number, locale = 'fr-FR'): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—'

/**
 * Renders a unit-bearing GHz value from MHz (RVTools' native speed unit).
 * One decimal of precision is enough for cluster-level reporting.
 */
export const fmtGhz = (mhz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(mhz)) return '—'
  const ghz = mhz / 1000
  return `${ghz.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} GHz`
}

/**
 * Locale-aware unitless GHz formatter with **adaptive precision**: one
 * decimal for sub-10 values, integer otherwise. The threshold keeps
 * large clusters readable (`"230"`) while small clusters and
 * standalone-host rows (ADR-0014) don't collapse to `"0"` on values
 * like `0.24` (5 % × 5 GHz). Returns em-dash for non-finite inputs so
 * the dashboard can render placeholders without ad-hoc null guards.
 *
 * Composed by `fmtGhzValue` for the unit-bearing case and used
 * directly by callers that render a `consumed / physical` pair
 * (e.g. cluster-card KPI).
 */
export const fmtGhzNumber = (ghz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(ghz)) return '—'
  const opts =
    Math.abs(ghz) < 10
      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 }
  return ghz.toLocaleString(locale, opts)
}

/**
 * Renders an already-GHz value as a unit-bearing string. Adaptive
 * precision (see `fmtGhzNumber`): `"230 GHz"` for large clusters,
 * `"0,2 GHz"` for small / standalone-host rows.
 */
export const fmtGhzValue = (ghz: number, locale = 'fr-FR'): string =>
  Number.isFinite(ghz) ? `${fmtGhzNumber(ghz, locale)} GHz` : '—'

/**
 * Renders an already-MHz value as a unit-bearing string (`"385 MHz"`).
 * Used for the per-vCPU rate on cluster cards.
 *
 * `0` is treated as a sentinel ("no powered-on vCPUs to divide by")
 * and rendered as em-dash — same convention as `fmtRatio`. The
 * aggregator emits `mhzPerVcpu === 0` only when `vcpuAllocated === 0`
 * (see `computeMhzPerVcpu`), so a literal `0` is never a true
 * measurement here.
 */
export const fmtMhzValue = (mhz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(mhz) || mhz === 0) return '—'
  return `${Math.round(mhz).toLocaleString(locale, { maximumFractionDigits: 0 })} MHz`
}

/**
 * Renders a 0..1 ratio as a localized percent (one decimal). Inputs outside
 * [0, 1] are passed through to `Intl.NumberFormat` unmodified — clamp upstream
 * if you want to avoid surprising readers with values like "115 %".
 */
export const fmtPercent = (ratio: number, locale = 'fr-FR'): string =>
  Number.isFinite(ratio)
    ? ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })
    : '—'

/** Same as `fmtPercent` but with no decimals — `"23 %"`. */
export const fmtPercentWhole = (ratio: number, locale = 'fr-FR'): string =>
  Number.isFinite(ratio)
    ? ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 })
    : '—'

/**
 * Format an already-percentage value (0..200) with one decimal and a
 * trailing `%`. Distinct from `fmtPercent` (which expects a 0..1 ratio
 * and multiplies by 100). Used for CPU Ready, where the source value is
 * already in percent units (ADR-0012).
 */
export const fmtPercentValue = (percent: number, locale = 'fr-FR'): string =>
  Number.isFinite(percent)
    ? `${percent.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
    : '—'

/**
 * Render a vCPU/pCPU consolidation ratio as `"X.X : 1"`. Locale-aware
 * decimal separator: fr-FR → `"4,2 : 1"`, en-US → `"4.2 : 1"`. Returns
 * em-dash for non-finite or zero ratios — `"5 vCPU on 0 cores"` isn't
 * meaningful, surface it as `—` rather than `Infinity` / `NaN`.
 */
export const fmtRatio = (ratio: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(ratio) || ratio === 0) return '—'
  const formatted = ratio.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${formatted} : 1`
}

/**
 * Formats a memory amount given in MB with TB / GB / MB tiering.
 *   ≥ 1 048 576 MB → `"X.X TB"`
 *   ≥ 1 024 MB     → `"X.X GB"`
 *   else           → `"X MB"`
 */
export const fmtMemMb = (mb: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(mb)) return '—'
  const opts = { maximumFractionDigits: 1, minimumFractionDigits: 1 } as const
  const abs = Math.abs(mb)
  if (abs >= 1024 * 1024) return `${(mb / 1024 / 1024).toLocaleString(locale, opts)} TB`
  if (abs >= 1024) return `${(mb / 1024).toLocaleString(locale, opts)} GB`
  return `${Math.round(mb).toLocaleString(locale, { maximumFractionDigits: 0 })} MB`
}
