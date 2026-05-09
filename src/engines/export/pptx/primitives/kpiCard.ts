import type PptxGenJS from 'pptxgenjs'
import { FONT, THEME } from '../theme'

type Slide = PptxGenJS.Slide
/** 6-char hex color (no leading `#`), as pptxgenjs expects. */
type HexColor = string

export interface KpiCardOptions {
  x: number
  y: number
  w: number
  h: number
  /** The headline value, e.g. `"23%"` or `"2 430 GHz"`. */
  big: string
  /** The label rendered below the headline, e.g. `"CPU moyen"`. */
  small: string
  /** Status accent color used for the left rail and the headline. */
  accent: HexColor
  /** Background color of the card body. Defaults to the lightBg from the theme. */
  background?: HexColor
}

/**
 * Render the four-shape primitive used on cluster slides for the small KPI
 * tiles: rounded background, left status rail, big number, small label.
 *
 * Used on the cluster slide (Row 1, four cards) and on the title slide
 * (estate-wide KPIs at the bottom).
 */
export const drawKpiCard = (slide: Slide, opts: KpiCardOptions): void => {
  const { x, y, w, h, big, small, accent, background = THEME.lightBg } = opts

  // Rounded background body
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    fill: { color: background },
    line: { color: background, width: 0 },
    rectRadius: 0.08,
  })

  // Left status rail (12-pt wide accent bar)
  slide.addShape('rect', {
    x,
    y,
    w: 0.12,
    h,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  })

  // Headline number
  slide.addText(big, {
    x: x + 0.25,
    y: y + 0.1,
    w: w - 0.3,
    h: 0.6,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: accent,
    valign: 'top',
    margin: 0,
  })

  // Subordinate label
  slide.addText(small, {
    x: x + 0.25,
    y: y + 0.66,
    w: w - 0.3,
    h: 0.35,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.grey,
    valign: 'top',
    margin: 0,
  })
}

/**
 * Variant used on the navy title-slide footer: white text on a navy tile,
 * with a gold accent rail. Same geometry as `drawKpiCard`, different palette.
 */
export const drawKpiCardOnNavy = (
  slide: Slide,
  opts: Omit<KpiCardOptions, 'background' | 'accent'>,
): void => {
  drawKpiCard(slide, {
    ...opts,
    background: '2A3580', // slightly lighter navy, matches Python reference
    accent: THEME.gold,
  })
  // Override the labels to use light text — re-emit them on top.
  const { x, y, w, big, small } = opts
  slide.addText(big, {
    x: x + 0.25,
    y: y + 0.1,
    w: w - 0.3,
    h: 0.6,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: THEME.gold,
    valign: 'top',
    margin: 0,
  })
  slide.addText(small, {
    x: x + 0.25,
    y: y + 0.66,
    w: w - 0.3,
    h: 0.35,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.ice,
    valign: 'top',
    margin: 0,
  })
}
