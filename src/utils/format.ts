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
 * Renders a 0..1 ratio as a localized percent (one decimal). Inputs outside
 * [0, 1] are passed through to `Intl.NumberFormat` unmodified — clamp upstream
 * if you want to avoid surprising readers with values like "115 %".
 */
export const fmtPercent = (ratio: number, locale = 'fr-FR'): string =>
  Number.isFinite(ratio)
    ? ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })
    : '—'
