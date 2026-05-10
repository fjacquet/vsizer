import type PptxGenJS from 'pptxgenjs'
import { CONTENTION_THRESHOLDS } from '../../../aggregation/contention'
import type { TopReadinessVm } from '../../../aggregation/vinfoMerge'
import type { ClusterAggregate } from '../../../../types'
import { fmtIntPptx, fmtPercentOneDecimal } from '../format'
import { contentionColor } from '../primitives/colors'
import { FONT, SLIDE_H, SLIDE_W, THEME } from '../theme'

type Slide = PptxGenJS.Slide

/**
 * Strings consumed by {@link addContentionAnnexSlide}. Each function takes
 * the runtime arguments it needs so a translator can reorder them
 * idiomatically (FR puts the count after the noun, EN before it).
 */
export interface ContentionAnnexStrings {
  /** "VMs avec CPU Ready le plus élevé — {{cluster}}" — title.
   *  The cluster name is interpolated; n is informational (matches the
   *  number of rows actually rendered, capped at TOP_N_DEFAULT). */
  title: (vars: { n: number; cluster: string }) => string
  /** Static factual subtitle: source attribution + reference threshold.
   *  No verdict / adjective per ADR-0003. */
  subtitle: string
  columns: {
    /** "#" — rank column header */
    rank: string
    vmName: string
    vcpu: string
    /** "CPU Ready" */
    readiness: string
    cluster: string
  }
  /** Bare reference text rendered alongside three colored swatches:
   *  "Référence VMware : <5 % · 5–10 % · >10 %". The swatches carry
   *  no labels of their own; the text reads with them. */
  legendReference: string
  /** Source attribution at the bottom of the slide; same shape as
   *  ClusterSlideStrings.footer. */
  footer: string
}

const drawHeaderRail = (slide: Slide): void => {
  // Identical idiom to clusterSlide.ts:82-101 — no shared util because
  // the deck has no slide-base abstraction yet and the duplication is
  // small. Bring this into a shared module if a third consumer appears.
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.35,
    h: SLIDE_H,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })
  slide.addShape('rect', {
    x: 0.35,
    y: 0,
    w: SLIDE_W - 0.35,
    h: 1.15,
    fill: { color: THEME.navy },
    line: { color: THEME.navy, width: 0 },
  })
}

// Column geometry (top-to-bottom, left-to-right). Sums to 12.0 in,
// matching the bannerW used elsewhere on the deck.
const COL_X = {
  rank: 0.7,
  vmName: 1.2,
  vcpu: 6.8,
  readiness: 8.0,
  cluster: 9.7,
} as const
const COL_W = {
  rank: 0.5,
  vmName: 5.6,
  vcpu: 1.2,
  readiness: 1.7,
  cluster: 3.0,
} as const

const ROW_H = 0.42
const ROW_Y0 = 1.95 // first data row Y; header at ROW_Y0 - 0.30
const HEADER_Y = ROW_Y0 - 0.32

/**
 * One row of the table: optional alternating-stripe background, cell
 * texts. The stripe pattern mirrors `overviewSlide.ts:140-148` (rect
 * `addShape` + `addText` cells) — there's no `addTable` usage in the
 * codebase and we keep the convention.
 */
const drawRow = (
  slide: Slide,
  rank: number,
  vm: TopReadinessVm,
  zebra: boolean,
): void => {
  const y = ROW_Y0 + rank * ROW_H
  if (zebra) {
    slide.addShape('rect', {
      x: COL_X.rank - 0.05,
      y,
      w: SLIDE_W - 1.4,
      h: ROW_H,
      fill: { color: THEME.lightBg },
      line: { color: THEME.lightBg, width: 0 },
    })
  }
  slide.addText(String(rank + 1), {
    x: COL_X.rank,
    y,
    w: COL_W.rank,
    h: ROW_H,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.grey,
    align: 'left',
    valign: 'middle',
    margin: 0,
  })
  slide.addText(vm.vmName, {
    x: COL_X.vmName,
    y,
    w: COL_W.vmName,
    h: ROW_H,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.darkText,
    align: 'left',
    valign: 'middle',
    margin: 0,
  })
  slide.addText(fmtIntPptx(vm.vcpu), {
    x: COL_X.vcpu,
    y,
    w: COL_W.vcpu,
    h: ROW_H,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.grey,
    align: 'right',
    valign: 'middle',
    margin: 0,
  })
  slide.addText(fmtPercentOneDecimal(vm.cpuReadinessPercent), {
    x: COL_X.readiness,
    y,
    w: COL_W.readiness,
    h: ROW_H,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: contentionColor(vm.cpuReadinessPercent),
    align: 'right',
    valign: 'middle',
    margin: 0,
  })
  slide.addText(vm.cluster, {
    x: COL_X.cluster,
    y,
    w: COL_W.cluster,
    h: ROW_H,
    fontFace: FONT,
    fontSize: 10,
    color: THEME.grey,
    align: 'left',
    valign: 'middle',
    margin: 0,
  })
}

/**
 * Annex slide: top-N VMs in a cluster, sorted by CPU Ready %, with
 * a factual subtitle, the standard threshold legend, and a footer
 * source attribution. The caller is expected to:
 *   - only invoke when `cluster.readinessAvailable && topVms.length > 0`
 *     (typically `vmsAboveReadinessWarning > 0` too)
 *   - pass an already-sorted, already-capped list (the helper does
 *     not re-sort or re-cap)
 *
 * Geometry constraints (slide is 13.333 × 7.5 in):
 *   - Header band: 0..1.15
 *   - Title:        y=0.18, h=0.55
 *   - Subtitle:     y=0.78, h=0.30
 *   - Column headers: y=1.63
 *   - Data rows:    y=1.95 + i × 0.42 (TOP_N_DEFAULT=10 → ends 6.15)
 *   - Reference legend: y=6.40
 *   - Footer:       y=7.10
 *
 * See ADR-0012 §4 for the rationale, and the contract that the words
 * on this slide stay factual (no "warning" / "contention" / "⚠️").
 */
export const addContentionAnnexSlide = (
  pptx: PptxGenJS,
  cluster: ClusterAggregate,
  topVms: ReadonlyArray<TopReadinessVm>,
  strings: ContentionAnnexStrings,
): void => {
  const slide = pptx.addSlide()

  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color: THEME.white },
    line: { color: THEME.white, width: 0 },
  })

  drawHeaderRail(slide)

  // Title (white on navy)
  slide.addText(strings.title({ n: topVms.length, cluster: cluster.cluster }), {
    x: 0.7,
    y: 0.18,
    w: 12,
    h: 0.55,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: THEME.white,
    valign: 'top',
    margin: 0,
  })

  // Subtitle (ice on navy) — source attribution and reference threshold
  slide.addText(strings.subtitle, {
    x: 0.7,
    y: 0.78,
    w: 12,
    h: 0.32,
    fontFace: FONT,
    fontSize: 11,
    color: THEME.ice,
    valign: 'top',
    margin: 0,
  })

  // Column headers — gold eyebrow, mirrors overviewSlide.ts:120
  const headerCells: Array<{ key: keyof typeof COL_X; align: 'left' | 'right' }> = [
    { key: 'rank', align: 'left' },
    { key: 'vmName', align: 'left' },
    { key: 'vcpu', align: 'right' },
    { key: 'readiness', align: 'right' },
    { key: 'cluster', align: 'left' },
  ]
  for (const h of headerCells) {
    slide.addText(strings.columns[h.key], {
      x: COL_X[h.key],
      y: HEADER_Y,
      w: COL_W[h.key],
      h: 0.28,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: THEME.gold,
      align: h.align,
      valign: 'middle',
      margin: 0,
    })
  }

  // Data rows — TOP_N_DEFAULT=10 caps at y = 1.95 + 10 × 0.42 = 6.15
  topVms.forEach((vm, i) => {
    drawRow(slide, i, vm, i % 2 === 0)
  })

  // Reference legend — three colored swatches + the bare cutoffs
  // (no adjectives) per ADR-0003. Lays out at y=6.40, well clear of
  // the data rows (which end at 6.15 for a full top-10).
  const LEG_Y = 6.4
  const SWATCH = 0.18
  // Layout: three swatches with text labels next to them.
  const swatches = [
    { color: THEME.green, label: `<${CONTENTION_THRESHOLDS.warning}%` },
    {
      color: THEME.orange,
      label: `${CONTENTION_THRESHOLDS.warning}–${CONTENTION_THRESHOLDS.serious}%`,
    },
    { color: THEME.red, label: `>${CONTENTION_THRESHOLDS.serious}%` },
  ]
  // Reference text on the left
  slide.addText(strings.legendReference, {
    x: 0.7,
    y: LEG_Y,
    w: 4.5,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    color: THEME.grey,
    valign: 'middle',
    margin: 0,
  })
  // Three swatches + labels, spaced from x=5.3 onward
  let swX = 5.3
  for (const sw of swatches) {
    slide.addShape('rect', {
      x: swX,
      y: LEG_Y + 0.06,
      w: SWATCH,
      h: SWATCH,
      fill: { color: sw.color },
      line: { color: sw.color, width: 0 },
    })
    slide.addText(sw.label, {
      x: swX + SWATCH + 0.05,
      y: LEG_Y,
      w: 0.9,
      h: 0.3,
      fontFace: FONT,
      fontSize: 10,
      color: THEME.darkText,
      valign: 'middle',
      margin: 0,
    })
    swX += SWATCH + 0.05 + 0.9 + 0.2
  }

  // Footer (source attribution) — same y/style as the cluster slide
  slide.addText(strings.footer, {
    x: 0.7,
    y: 7.1,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: THEME.grey,
    valign: 'top',
    margin: 0,
  })
}
