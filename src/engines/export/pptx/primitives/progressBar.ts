import type PptxGenJS from 'pptxgenjs'
import { THEME } from '../theme'
import { usageColor } from './colors'

type Slide = PptxGenJS.Slide

export interface ProgressBarOptions {
  /** Top-left x in inches. */
  x: number
  /** Top-left y in inches. */
  y: number
  /** Width in inches. */
  w: number
  /** Height in inches. */
  h: number
  /** Fill ratio 0..1. Values outside [0, 1] are clamped before drawing. */
  ratio: number
  /** If set (0..1), draws a thin gold marker at this position to flag the
   *  observed peak. Use for `maxCpuRatio` / `maxRamRatio`. */
  peak?: number
  /** Round the bar's corners. Slight visual softening for full-width bars. */
  rounded?: boolean
}

const clamp01 = (n: number): number => Math.max(0, Math.min(n, 1))

/**
 * Draw a horizontal progress bar onto `slide`. Three layered shapes:
 *   1. ice background (the track)
 *   2. status-colored fill, sized to `ratio`
 *   3. (optional) gold marker at `peak` position
 *
 * The bar is purely decorative — readability comes from the percentage label
 * the slide composer adds next to it.
 */
export const drawProgressBar = (slide: Slide, opts: ProgressBarOptions): void => {
  const { x, y, w, h, ratio, peak, rounded } = opts
  const shape = rounded ? 'roundRect' : 'rect'

  // Track
  slide.addShape(shape, {
    x,
    y,
    w,
    h,
    fill: { color: THEME.ice },
    line: { color: THEME.ice, width: 0 },
    ...(rounded ? { rectRadius: 0.05 } : {}),
  })

  // Filled portion
  const filled = clamp01(ratio)
  if (filled > 0) {
    slide.addShape(shape, {
      x,
      y,
      w: w * filled,
      h,
      fill: { color: usageColor(ratio) },
      line: { color: usageColor(ratio), width: 0 },
      ...(rounded ? { rectRadius: 0.05 } : {}),
    })
  }

  // Peak marker (gold tick that protrudes top + bottom)
  if (peak !== undefined && peak > 0) {
    const px = x + w * clamp01(peak) - 0.02
    slide.addShape('rect', {
      x: px,
      y: y - 0.04,
      w: 0.04,
      h: h + 0.08,
      fill: { color: THEME.gold },
      line: { color: THEME.gold, width: 0 },
    })
  }
}
