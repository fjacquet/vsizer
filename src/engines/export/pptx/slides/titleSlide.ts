import type PptxGenJS from 'pptxgenjs'
import type { GlobalSummary } from '../../../../types'
import { fmtGhzPptx, fmtIntPptx, fmtPctWhole } from '../format'
import { drawKpiCardOnNavy } from '../primitives/kpiCard'
import { FONT, SLIDE_H, SLIDE_W, THEME } from '../theme'

export interface TitleSlideStrings {
  /** "vsizer — Utilisation des clusters" or English equivalent. */
  title: string
  /** Tag rendered above the title, e.g. "ANALYSE DE CAPACITÉ — VMware". */
  eyebrow: string
  /** Subtitle line, typically "Source: <file>  ·  Date: <date>". */
  subtitle: string
  /** Labels for the four bottom KPI tiles. */
  kpiLabels: {
    hosts: string
    vms: string
    physicalGhz: string
    meanCpu: string
  }
}

/**
 * Neutral title slide — see ADR-0003 for what was deliberately removed.
 * Layout:
 *   - Full-bleed navy background
 *   - Decorative gold strip near the bottom
 *   - Eyebrow tag, big title, subtitle (date + source filename)
 *   - 4 small KPI tiles at the bottom: estate-wide hosts / VMs / GHz / CPU%
 *
 * No taglines, no italic editorial copy, no recommendations.
 */
export const addTitleSlide = (
  pptx: PptxGenJS,
  globals: GlobalSummary,
  strings: TitleSlideStrings,
): void => {
  const slide = pptx.addSlide()

  // Full navy background
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })

  // Gold accent strip at the bottom
  slide.addShape('rect', {
    x: 0,
    y: 6.75,
    w: SLIDE_W,
    h: 0.18,
    fill: { color: THEME.gold },
    line: { color: THEME.gold, width: 0 },
  })

  // Eyebrow
  slide.addText(strings.eyebrow, {
    x: 0.7,
    y: 0.7,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: THEME.gold,
    valign: 'top',
    margin: 0,
  })

  // Big title
  slide.addText(strings.title, {
    x: 0.7,
    y: 1.4,
    w: 12,
    h: 1.6,
    fontFace: FONT,
    fontSize: 54,
    bold: true,
    color: THEME.white,
    valign: 'top',
    margin: 0,
  })

  // Subtitle (date + source file)
  slide.addText(strings.subtitle, {
    x: 0.7,
    y: 3.3,
    w: 12,
    h: 0.6,
    fontFace: FONT,
    fontSize: 18,
    italic: true,
    color: THEME.ice,
    valign: 'top',
    margin: 0,
  })

  // Bottom KPI tiles — estate-wide. Four equal columns starting at x=0.7,
  // total width 12, gap 0.15.
  const tiles = [
    { big: fmtIntPptx(globals.hostCount), small: strings.kpiLabels.hosts },
    { big: fmtIntPptx(globals.vmCount), small: strings.kpiLabels.vms },
    { big: fmtGhzPptx(globals.physicalGhz), small: strings.kpiLabels.physicalGhz },
    { big: fmtPctWhole(globals.meanCpuRatio), small: strings.kpiLabels.meanCpu },
  ]

  const totalW = 12.0
  const gap = 0.15
  const tileW = (totalW - gap * (tiles.length - 1)) / tiles.length
  const tileH = 1.55
  let tx = 0.7
  for (const tile of tiles) {
    drawKpiCardOnNavy(slide, {
      x: tx,
      y: 5.0,
      w: tileW,
      h: tileH,
      big: tile.big,
      small: tile.small,
    })
    tx += tileW + gap
  }
}
