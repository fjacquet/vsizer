/**
 * Midnight Executive palette as pptxgenjs expects it: 6-char hex strings
 * **without** the `#` prefix. These mirror the constants the legacy Python
 * generator (`.reference/build_pptx.py`) used so the deck looks the same.
 *
 * Keep this file in sync with the Tailwind tokens in `src/index.css` — the
 * dashboard preview is meant to look identical to the exported deck.
 */
export const THEME = {
  navy: '1E2761',
  ice: 'CADCFC',
  white: 'FFFFFF',
  darkText: '21295C',
  grey: '6B7291',
  lightBg: 'F5F7FC',
  green: '2E8B57',
  orange: 'E07B00',
  red: 'C0392B',
  gold: 'F9B935',
  teal: '02889C',
} as const

export type ThemeColor = (typeof THEME)[keyof typeof THEME]

/** PowerPoint widescreen layout: 13.333 × 7.5 inches. */
export const SLIDE_W = 13.333
export const SLIDE_H = 7.5

/** Default font for body and headings. Picked to match the Python reference
 *  and to render consistently on Windows / macOS / Linux PowerPoint clients. */
export const FONT = 'Calibri'

/**
 * Stable usage thresholds matching the legacy generator's logic:
 *   < 0.40 → green   (low utilization)
 *   < 0.70 → orange  (moderate utilization)
 *   ≥ 0.70 → red     (high utilization)
 *
 * These are status colors, **not** value judgments — see ADR-0003.
 */
export const USAGE_THRESHOLDS = {
  low: 0.4,
  high: 0.7,
} as const
