import { CONTENTION_THRESHOLDS } from '../../../aggregation/contention'
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

/**
 * Map a CPU Ready percentage (0..200) to a status hex color using the
 * VMware-standard thresholds in `CONTENTION_THRESHOLDS`:
 *   < 5 %   → green   (no notable scheduling pressure)
 *   5..10 % → orange  (worth surfacing)
 *   > 10 %  → red     (sustained scheduling pressure)
 *   NaN     → grey    (no value)
 *
 * Distinct from `usageColor` because the units differ (percent vs ratio)
 * and the thresholds are unrelated. Same palette tokens, same status-not-
 * verdict convention (ADR-0003 / ADR-0012).
 */
export const contentionColor = (percent: number): ThemeColor => {
  if (!Number.isFinite(percent)) return THEME.grey
  if (percent < CONTENTION_THRESHOLDS.warning) return THEME.green
  if (percent <= CONTENTION_THRESHOLDS.serious) return THEME.orange
  return THEME.red
}
