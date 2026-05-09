import { THEME, type ThemeColor, USAGE_THRESHOLDS } from '../theme'

/**
 * Map a 0..1 utilization ratio to a status hex color.
 *   < 0.40 → green
 *   < 0.70 → orange
 *   ≥ 0.70 → red
 *
 * The threshold logic is **not a value judgment** — it's a stable status
 * convention shared by the dashboard and the deck (ADR-0003). Anything that
 * implies "good" or "bad" stays in the speaker's narration.
 */
export const usageColor = (ratio: number): ThemeColor => {
  if (!Number.isFinite(ratio)) return THEME.grey
  if (ratio < USAGE_THRESHOLDS.low) return THEME.green
  if (ratio < USAGE_THRESHOLDS.high) return THEME.orange
  return THEME.red
}
