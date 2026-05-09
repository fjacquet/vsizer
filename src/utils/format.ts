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
 * Renders an already-GHz value as a unit-bearing string (`"230 GHz"`). No
 * decimals — the dashboard summarizes capacity at integer-GHz granularity.
 */
export const fmtGhzValue = (ghz: number, locale = 'fr-FR'): string =>
  Number.isFinite(ghz)
    ? `${Math.round(ghz).toLocaleString(locale, { maximumFractionDigits: 0 })} GHz`
    : '—'

/**
 * Renders an already-MHz value as a unit-bearing string (`"385 MHz"`).
 * Used for the per-vCPU rate on cluster cards.
 */
export const fmtMhzValue = (mhz: number, locale = 'fr-FR'): string =>
  Number.isFinite(mhz)
    ? `${Math.round(mhz).toLocaleString(locale, { maximumFractionDigits: 0 })} MHz`
    : '—'

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
