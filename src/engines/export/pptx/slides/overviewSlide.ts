import type PptxGenJS from 'pptxgenjs'
import type { ClusterAggregate } from '../../../../types'
import { fmtGhzPptx, fmtMemMb, fmtPctWhole } from '../format'
import { drawProgressBar } from '../primitives/progressBar'
import { FONT, SLIDE_H, SLIDE_W, THEME } from '../theme'

export interface OverviewSlideStrings {
  title: string
  subtitle: string
  columns: {
    cluster: string
    hostsVms: string
    /** "0%   ·   utilisation hôtes (haut: CPU, bas: RAM)   ·   100%" */
    bars: string
    meanPeak: string
    /** Header for the rightmost stacked-availability column. */
    available: string
  }
  /** "CPU" / "RAM" labels next to each pair of bars. */
  cpuLabel: string
  ramLabel: string
  /** Pill text rendered next to a stretched cluster's name. */
  stretchedBadge: string
  /** Legend strings — same ordering as the colors array (low / mid / high / peak). */
  legend: {
    title: string
    low: string
    mid: string
    high: string
    peak: string
  }
}

/**
 * Single-page overview: one row per cluster, stacked CPU + RAM bars with
 * peak markers, plus a "GHz disponibles" column. No editorial language —
 * see ADR-0003. The column previously labeled "Marge libérable" becomes
 * "GHz disponibles" — same number, neutral framing.
 */
export const addOverviewSlide = (
  pptx: PptxGenJS,
  clusters: readonly ClusterAggregate[],
  strings: OverviewSlideStrings,
): void => {
  const slide = pptx.addSlide()

  // White body
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color: THEME.white },
    line: { color: THEME.white, width: 0 },
  })

  // Navy header band
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.0,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })

  slide.addText(strings.title, {
    x: 0.5,
    y: 0.18,
    w: 12,
    h: 0.6,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: THEME.white,
    valign: 'top',
    margin: 0,
  })

  slide.addText(strings.subtitle, {
    x: 0.5,
    y: 0.7,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.ice,
    valign: 'top',
    margin: 0,
  })

  // Layout grid (matches the Python reference geometry)
  const top = 1.25
  const bottomPad = 0.5
  const rowH = clusters.length === 0 ? 0 : (SLIDE_H - top - bottomPad) / clusters.length

  const nameX = 0.45
  const nameW = 1.35
  const infoX = 1.85
  const infoW = 1.35
  const barX = 3.3
  const barW = 6.6
  const pctX = barX + barW + 0.15
  const pctW = 1.5
  const headX = pctX + pctW + 0.05
  const headW = 1.55
  const barH = 0.13 // ≈ 9pt in inches

  // Column headers (gold accents)
  const headerY = top - 0.22
  const headerH = 0.2
  const headers: Array<[number, number, string, PptxGenJS.HAlign?]> = [
    [nameX, nameW, strings.columns.cluster],
    [infoX, infoW, strings.columns.hostsVms],
    [barX, barW, strings.columns.bars, 'center'],
    [pctX, pctW, strings.columns.meanPeak],
    [headX, headW, strings.columns.available],
  ]
  for (const [x, w, text, align] of headers) {
    slide.addText(text, {
      x,
      y: headerY,
      w,
      h: headerH,
      fontFace: FONT,
      fontSize: 8,
      bold: true,
      color: THEME.gold,
      align: align ?? 'left',
      valign: 'top',
      margin: 0,
    })
  }

  // Per-cluster rows
  clusters.forEach((cluster, i) => {
    const y = top + rowH * i

    // Alternate stripe (light bg)
    if (i % 2 === 0) {
      slide.addShape('rect', {
        x: 0.3,
        y,
        w: SLIDE_W - 0.6,
        h: rowH - 0.014,
        fill: { color: THEME.lightBg },
        line: { color: THEME.lightBg, width: 0 },
      })
    }

    // Cluster name (+ inline [Étendu] tag when stretched)
    slide.addText(cluster.cluster, {
      x: nameX,
      y,
      w: nameW,
      h: rowH,
      fontFace: FONT,
      fontSize: 11,
      bold: true,
      color: THEME.darkText,
      valign: 'middle',
      margin: 0,
    })
    if (cluster.stretched) {
      slide.addText(` [${strings.stretchedBadge}]`, {
        x: nameX + 0.78,
        y,
        w: nameW - 0.78,
        h: rowH,
        fontFace: FONT,
        fontSize: 8,
        bold: true,
        color: THEME.gold,
        valign: 'middle',
        margin: 0,
      })
    }

    // Hosts / VMs sub-info
    slide.addText(`${cluster.hostCount} hôtes\n${cluster.vmCount} VMs`, {
      x: infoX,
      y,
      w: infoW,
      h: rowH,
      fontFace: FONT,
      fontSize: 8,
      color: THEME.grey,
      valign: 'middle',
      margin: 0,
    })

    // Two bars stacked, centered vertically in the row
    const gap = 0.03
    const totalBars = barH * 2 + gap
    const cpuY = y + (rowH - totalBars) / 2
    const ramY = cpuY + barH + gap

    // CPU label
    slide.addText(strings.cpuLabel, {
      x: barX - 0.32,
      y: cpuY,
      w: 0.27,
      h: barH,
      fontFace: FONT,
      fontSize: 7,
      bold: true,
      color: THEME.grey,
      align: 'right',
      valign: 'middle',
      margin: 0,
    })
    drawProgressBar(slide, {
      x: barX,
      y: cpuY,
      w: barW,
      h: barH,
      ratio: cluster.meanCpuRatio,
      peak: cluster.maxCpuRatio,
    })

    // RAM label + bar
    slide.addText(strings.ramLabel, {
      x: barX - 0.32,
      y: ramY,
      w: 0.27,
      h: barH,
      fontFace: FONT,
      fontSize: 7,
      bold: true,
      color: THEME.grey,
      align: 'right',
      valign: 'middle',
      margin: 0,
    })
    drawProgressBar(slide, {
      x: barX,
      y: ramY,
      w: barW,
      h: barH,
      ratio: cluster.meanRamRatio,
      peak: cluster.maxRamRatio,
    })

    // Mean / peak text on the right
    slide.addText(
      `CPU  ${fmtPctWhole(cluster.meanCpuRatio)}   pic ${fmtPctWhole(cluster.maxCpuRatio)}`,
      {
        x: pctX,
        y,
        w: pctW,
        h: rowH / 2,
        fontFace: FONT,
        fontSize: 9,
        color: THEME.darkText,
        valign: 'middle',
        margin: 0,
      },
    )
    slide.addText(
      `RAM  ${fmtPctWhole(cluster.meanRamRatio)}   pic ${fmtPctWhole(cluster.maxRamRatio)}`,
      {
        x: pctX,
        y: y + rowH / 2,
        w: pctW,
        h: rowH / 2,
        fontFace: FONT,
        fontSize: 9,
        color: THEME.darkText,
        valign: 'middle',
        margin: 0,
      },
    )

    // Available — stacked GHz on top, RAM below.
    const ghzColor = cluster.availableGhz < 0 ? THEME.red : THEME.darkText
    const ramColor = cluster.availableRamMb < 0 ? THEME.red : THEME.grey
    const availablePct = cluster.physicalGhz > 0 ? cluster.availableGhz / cluster.physicalGhz : 0
    slide.addText(`${fmtGhzPptx(cluster.availableGhz)} (${fmtPctWhole(availablePct)})`, {
      x: headX,
      y,
      w: headW,
      h: rowH / 2,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: ghzColor,
      valign: 'middle',
      margin: 0,
    })
    slide.addText(fmtMemMb(cluster.availableRamMb), {
      x: headX,
      y: y + rowH / 2,
      w: headW,
      h: rowH / 2,
      fontFace: FONT,
      fontSize: 9,
      color: ramColor,
      valign: 'middle',
      margin: 0,
    })
  })

  // Legend footer
  const legendY = SLIDE_H - 0.35
  slide.addText(strings.legend.title, {
    x: 0.45,
    y: legendY,
    w: 0.8,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: THEME.navy,
    valign: 'middle',
    margin: 0,
  })

  const items = [
    { color: THEME.green, label: strings.legend.low },
    { color: THEME.orange, label: strings.legend.mid },
    { color: THEME.red, label: strings.legend.high },
    { color: THEME.gold, label: strings.legend.peak },
  ]
  let lx = 1.25
  for (const item of items) {
    slide.addShape('rect', {
      x: lx,
      y: legendY + 0.06,
      w: 0.18,
      h: 0.18,
      fill: { color: item.color },
      line: { color: item.color, width: 0 },
    })
    slide.addText(item.label, {
      x: lx + 0.22,
      y: legendY,
      w: 1.6,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      color: THEME.darkText,
      valign: 'middle',
      margin: 0,
    })
    lx += 1.4
  }
}
