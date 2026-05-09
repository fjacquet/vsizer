/**
 * Format helpers tuned for the PPTX deck. They differ from
 * `src/utils/format.ts` (UI formatters) in two ways:
 *   1. They use a non-breaking thin space as the thousands separator so the
 *      output never wraps mid-number on a slide.
 *   2. They render a fixed `—` placeholder for non-finite inputs — the deck
 *      should never show `NaN` or `Infinity` to a customer.
 */

const NBSP = ' ' // narrow no-break space — fr-FR thousands separator

const groupThousands = (n: number): string => {
  // Build the string ourselves to avoid Node ICU variants returning either
  // U+00A0 or U+202F unpredictably.
  const sign = n < 0 ? '-' : ''
  const abs = Math.trunc(Math.abs(n)).toString()
  const groups: string[] = []
  for (let i = abs.length; i > 0; i -= 3) {
    groups.unshift(abs.slice(Math.max(0, i - 3), i))
  }
  return sign + groups.join(NBSP)
}

/** Format an integer with thin-space thousands separators (fr-FR convention). */
export const fmtIntPptx = (n: number): string => (Number.isFinite(n) ? groupThousands(n) : '—')

/** Format a GHz value as `"X GHz"` (no decimals). Mirrors the Python reference. */
export const fmtGhzPptx = (ghz: number): string =>
  Number.isFinite(ghz) ? `${groupThousands(ghz)} GHz` : '— GHz'

/** Format an MHz value as `"X MHz"`. */
export const fmtMhzPptx = (mhz: number): string =>
  Number.isFinite(mhz) ? `${groupThousands(mhz)} MHz` : '— MHz'

/** Format a 0..1 ratio as a percent with no decimals (`"23%"`). */
export const fmtPctWhole = (ratio: number): string =>
  Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '—'

/** Format a 0..1 ratio as a percent with one decimal (`"23.4%"`). */
export const fmtPctOneDecimal = (ratio: number): string =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}%` : '—'

/**
 * Format a memory amount given in MB, with TB / GB / MB tiering. Reproduces
 * the legacy `fmt_mb` helper.
 *   ≥ 1 048 576 MB → "X.X TB"
 *   ≥ 1 024 MB     → "X.X GB"
 *   else           → "X MB"
 */
export const fmtMemMb = (mb: number): string => {
  if (!Number.isFinite(mb)) return '—'
  const abs = Math.abs(mb)
  if (abs >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(1)} TB`
  if (abs >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

/**
 * Format a host's GHz-per-core figure as `"X.XX GHz/core"`.
 * Used in the cluster-slide header.
 */
export const fmtGhzPerCore = (mhz: number): string => {
  if (!Number.isFinite(mhz) || mhz <= 0) return '— GHz/core'
  return `${(mhz / 1000).toFixed(2)} GHz/core`
}
