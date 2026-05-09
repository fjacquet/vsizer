import type PptxGenJS from 'pptxgenjs'
import type { ClusterAggregate } from '../../../../types'
import {
  fmtGhzPerCore,
  fmtGhzPptx,
  fmtIntPptx,
  fmtMemMb,
  fmtMhzPptx,
  fmtPctOneDecimal,
  fmtPctWhole,
} from '../format'
import { usageColor } from '../primitives/colors'
import { drawKpiCard } from '../primitives/kpiCard'
import { drawProgressBar } from '../primitives/progressBar'
import { FONT, SLIDE_H, SLIDE_W, THEME } from '../theme'

type Slide = PptxGenJS.Slide

export interface ClusterSlideStrings {
  /**
   * Renders the line under the cluster name in the navy header.
   * Receives the per-cluster numbers; the function decides the wording so
   * translators can reorder elements idiomatically. When `stretched` is
   * true, the function should also incorporate the DR-reserved figures.
   */
  subtitle: (input: {
    hostCount: number
    vmCount: number
    totalCoresFormatted: string
    ghzPerCoreFormatted: string
    physicalRamFormatted: string
    stretched: boolean
    drReservedGhzFormatted: string
    drReservedRamFormatted: string
  }) => string
  /** Pill text rendered next to the cluster name when stretched. */
  stretchedBadge: string
  /** Single neutral line under the banner: "RAM disponible: X". */
  ramAvailableLine: (formatted: string) => string
  cards: {
    cpuMean: string
    ramMean: string
    /** "GHz utilisés / phys." — neutral, just a unit. */
    ghzUsedVsPhys: string
    /** "réels par vCPU alloué" — descriptive, not editorial. */
    mhzPerVcpu: string
  }
  blocks: {
    cpuTitle: string
    ramTitle: string
    /**
     * Built per-cluster — consumed-of-physical with optional DR suffix.
     * The third arg is the formatted DR reservation (empty string when
     * not stretched).
     */
    cpuSubtitle: (consumedGhzText: string, physicalGhzText: string, drSuffix: string) => string
    ramSubtitle: (consumedMemText: string, physicalMemText: string, drSuffix: string) => string
    /** Min / mean / max strip. */
    min: string
    mean: string
    max: string
  }
  /**
   * The factual bottom-banner labels that replace the legacy "Marge libérable"
   * + "Ce cluster ronronne à X%" framing — see ADR-0003.
   */
  banner: {
    /** Banner title (small, gold). E.g. "DONNÉES CLÉS". */
    title: string
    vcpuAllocated: string
    /** "Capacité réservée (vCPU × clock host)" — descriptive label. */
    reservedCapacity: string
    consumedGhz: string
    availableGhz: string
  }
  footer: string
}

const drawHeaderRail = (slide: Slide): void => {
  // Left navy rail (full height, decorative)
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.35,
    h: SLIDE_H,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })
  // Top navy header band
  slide.addShape('rect', {
    x: 0.35,
    y: 0,
    w: SLIDE_W - 0.35,
    h: 1.15,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })
}

/**
 * Draw a small gold rounded-rect "Étendu / Stretched" pill at (x, y).
 * Returns the right edge so the caller can lay out content after it.
 */
const drawStretchedBadge = (slide: Slide, x: number, y: number, label: string): number => {
  const w = 1.0
  const h = 0.32
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    fill: { color: THEME.gold },
    line: { color: THEME.gold, width: 0 },
    rectRadius: 0.04,
  })
  slide.addText(label, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: THEME.navy,
    align: 'center',
    valign: 'middle',
    margin: 0,
  })
  return x + w
}

const drawUtilizationBlock = (
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  ratioMean: number,
  ratioMax: number,
  ratioMin: number,
  title: string,
  subtitle: string,
  labels: ClusterSlideStrings['blocks'],
): void => {
  // Card body
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    fill: { color: THEME.lightBg },
    line: { color: THEME.lightBg, width: 0 },
    rectRadius: 0.08,
  })

  // Title
  slide.addText(title, {
    x: x + 0.3,
    y: y + 0.18,
    w: w - 0.6,
    h: 0.35,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    color: THEME.navy,
    valign: 'top',
    margin: 0,
  })

  // Subtitle (factual, no judgment)
  slide.addText(subtitle, {
    x: x + 0.3,
    y: y + 0.5,
    w: w - 0.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    color: THEME.grey,
    valign: 'top',
    margin: 0,
  })

  // Big bar
  const barX = x + 0.3
  const barY = y + 0.95
  const barW = w - 0.6
  const barH = 0.32
  drawProgressBar(slide, {
    x: barX,
    y: barY,
    w: barW,
    h: barH,
    ratio: ratioMean,
    peak: ratioMax,
    rounded: true,
  })

  // 0% / 100% endpoints
  slide.addText('0%', {
    x: barX,
    y: barY + barH + 0.05,
    w: barW,
    h: 0.2,
    fontFace: FONT,
    fontSize: 8,
    color: THEME.grey,
    valign: 'top',
    margin: 0,
  })
  slide.addText('100%', {
    x: barX,
    y: barY + barH + 0.05,
    w: barW,
    h: 0.2,
    fontFace: FONT,
    fontSize: 8,
    color: THEME.grey,
    align: 'right',
    valign: 'top',
    margin: 0,
  })

  // Min / mean / max strip
  const sy = y + 1.55
  const sw = barW / 3
  const stats = [
    { lab: labels.min, val: fmtPctWhole(ratioMin), color: THEME.grey },
    { lab: labels.mean, val: fmtPctOneDecimal(ratioMean), color: usageColor(ratioMean) },
    { lab: labels.max, val: fmtPctWhole(ratioMax), color: THEME.grey },
  ]
  stats.forEach((stat, i) => {
    const sx = barX + sw * i
    slide.addText(stat.lab, {
      x: sx,
      y: sy,
      w: sw,
      h: 0.25,
      fontFace: FONT,
      fontSize: 9,
      color: THEME.grey,
      align: 'center',
      valign: 'top',
      margin: 0,
    })
    slide.addText(stat.val, {
      x: sx,
      y: sy + 0.22,
      w: sw,
      h: 0.32,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: stat.color,
      align: 'center',
      valign: 'top',
      margin: 0,
    })
  })
}

/**
 * One slide per selected cluster. Layout follows the Python reference but the
 * bottom banner is **factual** — no "💡 RESIZE", no "Ce cluster ronronne à
 * X %", no "Marge libérable". Four neutral data tiles with the raw figures,
 * the speaker delivers the narrative.
 *
 * When `cluster.stretched` is true (ADR-0007), the cluster name carries an
 * "Étendu / Stretched" pill, the subtitle appends "DR: X GHz / Y RAM réservés",
 * the utilization block subtitles call out the DR reservation, and a single
 * "RAM disponible: X" line is added under the banner. The banner itself is
 * unchanged structurally — its `availableGhz` tile already reflects the
 * DR-aware figure (computed upstream in `aggregateClusters`).
 */
export const addClusterSlide = (
  pptx: PptxGenJS,
  cluster: ClusterAggregate,
  totalCoresAcrossHosts: number,
  speedMhzAvg: number,
  physicalRamMb: number,
  strings: ClusterSlideStrings,
): void => {
  const slide = pptx.addSlide()

  // Body white
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color: THEME.white },
    line: { color: THEME.white, width: 0 },
  })

  drawHeaderRail(slide)

  // Cluster name. When stretched, leave room for the pill on the right
  // and draw it after measuring the name's footprint.
  const nameW = cluster.stretched ? 8 : 10
  slide.addText(cluster.cluster, {
    x: 0.7,
    y: 0.18,
    w: nameW,
    h: 0.7,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: THEME.white,
    valign: 'top',
    margin: 0,
  })
  if (cluster.stretched) {
    drawStretchedBadge(slide, 0.7 + nameW + 0.1, 0.32, strings.stretchedBadge)
  }

  // Sub-info line — receives both physical RAM and DR-reservation context.
  slide.addText(
    strings.subtitle({
      hostCount: cluster.hostCount,
      vmCount: cluster.vmCount,
      totalCoresFormatted: fmtIntPptx(totalCoresAcrossHosts),
      ghzPerCoreFormatted: fmtGhzPerCore(speedMhzAvg),
      physicalRamFormatted: fmtMemMb(physicalRamMb),
      stretched: cluster.stretched,
      drReservedGhzFormatted: fmtGhzPptx(cluster.drReservedGhz),
      drReservedRamFormatted: fmtMemMb(cluster.drReservedRamMb),
    }),
    {
      x: 0.7,
      y: 0.72,
      w: 11,
      h: 0.35,
      fontFace: FONT,
      fontSize: 12,
      color: THEME.ice,
      valign: 'top',
      margin: 0,
    },
  )

  // ---- Row 1: 4 KPI cards ------------------------------------------------
  const cardY = 1.35
  const cardH = 1.05
  const ghzUsedPhysText = `${fmtIntPptx(cluster.consumedGhz)} / ${fmtIntPptx(cluster.physicalGhz)}`
  const cards = [
    {
      big: fmtPctWhole(cluster.meanCpuRatio),
      small: strings.cards.cpuMean,
      accent: usageColor(cluster.meanCpuRatio),
    },
    {
      big: fmtPctWhole(cluster.meanRamRatio),
      small: strings.cards.ramMean,
      accent: usageColor(cluster.meanRamRatio),
    },
    {
      big: ghzUsedPhysText,
      small: strings.cards.ghzUsedVsPhys,
      accent: THEME.navy,
    },
    {
      big: fmtMhzPptx(cluster.mhzPerVcpu),
      small: strings.cards.mhzPerVcpu,
      accent: THEME.teal,
    },
  ]
  let cx = 0.7
  const cw = 2.95
  const cardGap = 0.15
  for (const card of cards) {
    drawKpiCard(slide, {
      x: cx,
      y: cardY,
      w: cw,
      h: cardH,
      big: card.big,
      small: card.small,
      accent: card.accent,
    })
    cx += cw + cardGap
  }

  // ---- Row 2: CPU and RAM utilization blocks -----------------------------
  const blockY = 2.6
  const blockH = 2.1
  const blockW = 6.05

  const cpuDrSuffix = cluster.stretched ? fmtGhzPptx(cluster.drReservedGhz) : ''
  const ramDrSuffix = cluster.stretched ? fmtMemMb(cluster.drReservedRamMb) : ''

  const cpuSubtitle = strings.blocks.cpuSubtitle(
    fmtGhzPptx(cluster.consumedGhz),
    fmtGhzPptx(cluster.physicalGhz),
    cpuDrSuffix,
  )
  const ramSubtitle = strings.blocks.ramSubtitle(
    fmtMemMb(cluster.consumedRamMb),
    fmtMemMb(cluster.physicalRamMb),
    ramDrSuffix,
  )

  drawUtilizationBlock(
    slide,
    0.7,
    blockY,
    blockW,
    blockH,
    cluster.meanCpuRatio,
    cluster.maxCpuRatio,
    cluster.minCpuRatio,
    strings.blocks.cpuTitle,
    cpuSubtitle,
    strings.blocks,
  )
  drawUtilizationBlock(
    slide,
    0.7 + blockW + 0.4,
    blockY,
    blockW,
    blockH,
    cluster.meanRamRatio,
    cluster.maxRamRatio,
    cluster.minRamRatio,
    strings.blocks.ramTitle,
    ramSubtitle,
    strings.blocks,
  )

  // ---- Row 3: factual data banner (no editorial framing) -----------------
  const bannerY = 4.85
  const bannerH = 1.7
  const bannerX = 0.7
  const bannerW = SLIDE_W - 1.4

  slide.addShape('roundRect', {
    x: bannerX,
    y: bannerY,
    w: bannerW,
    h: bannerH,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
    rectRadius: 0.08,
  })

  // Small gold eyebrow inside the banner — neutral label, no slogan
  slide.addText(strings.banner.title, {
    x: bannerX + 0.25,
    y: bannerY + 0.18,
    w: bannerW - 0.5,
    h: 0.4,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: THEME.gold,
    valign: 'top',
    margin: 0,
  })

  // 4 metric tiles — the factual replacement for the legacy "ronronne /
  // RESIZE EN GHZ / Marge libérable" panel. The "GHz disponibles" tile shows
  // the DR-aware figure when the cluster is stretched (math is upstream).
  const reservedGhz = (cluster.vcpuAllocated * speedMhzAvg) / 1000
  const tiles = [
    { lab: strings.banner.vcpuAllocated, val: fmtIntPptx(cluster.vcpuAllocated) },
    { lab: strings.banner.reservedCapacity, val: fmtGhzPptx(reservedGhz) },
    { lab: strings.banner.consumedGhz, val: fmtGhzPptx(cluster.consumedGhz) },
    {
      lab: strings.banner.availableGhz,
      val: fmtGhzPptx(cluster.availableGhz),
      // DR-at-risk colors aren't applied to the deck tile in V1 (the deck
      // is more conservative than the dashboard). Kept as a future hook.
    },
  ]
  const tileY = bannerY + 0.7
  let tx = bannerX + 0.25
  const innerW = bannerW - 0.5
  const tw = innerW / tiles.length
  for (const tile of tiles) {
    slide.addText(tile.lab, {
      x: tx,
      y: tileY,
      w: tw,
      h: 0.32,
      fontFace: FONT,
      fontSize: 10,
      color: THEME.ice,
      valign: 'top',
      margin: 0,
    })
    slide.addText(tile.val, {
      x: tx,
      y: tileY + 0.32,
      w: tw,
      h: 0.5,
      fontFace: FONT,
      fontSize: 20,
      bold: true,
      color: THEME.gold,
      valign: 'top',
      margin: 0,
    })
    tx += tw
  }

  // ---- Row 3-bis: RAM-disponible single line under the banner -------------
  // Mirrors the dashboard. Lives between banner (ends at 6.55) and footer
  // (starts at 7.05).
  slide.addText(strings.ramAvailableLine(fmtMemMb(cluster.availableRamMb)), {
    x: 0.7,
    y: 6.65,
    w: SLIDE_W - 1.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: cluster.availableRamMb < 0 ? THEME.red : THEME.darkText,
    valign: 'top',
    margin: 0,
  })

  // Footer (source attribution)
  slide.addText(strings.footer, {
    x: 0.7,
    y: 7.05,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: THEME.grey,
    valign: 'top',
    margin: 0,
  })
}
