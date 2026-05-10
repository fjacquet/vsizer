/**
 * VMware-standard CPU Ready (contention) thresholds, expressed as
 * percentages (0..100).
 *
 * The values match the recommendation in every Broadcom / VMware sizing
 * guide we surveyed:
 *   < `warning` (5 %) → no notable scheduling pressure
 *   `warning`..`serious` (5..10 %) → scheduling pressure worth surfacing
 *   > `serious` (10 %) → sustained scheduling pressure
 *
 * The constants are the single source of truth shared by:
 *   - the aggregator (`vinfoMerge.ts:readinessStats`) — used to count
 *     "VMs above warning"
 *   - the PPTX color helper (`primitives/colors.ts:contentionColor`) —
 *     used to map a percent to one of the THEME palette tokens
 *   - the dashboard surface (`ClusterCard.tsx`, `ContentionAnnex.tsx`)
 *     — same color mapping, light + dark variants per CLAUDE.md
 *
 * Per ADR-0003 these are **status** thresholds, not verdicts. The
 * dashboard and the deck show the color and the number; the speaker
 * interprets. No code in this repo should append "warning" / "bad" /
 * "critical" adjectives to the rendered output.
 *
 * See ADR-0012 for the full rationale (asymmetric source support,
 * factual presentation, top-N annex slide).
 */
export const CONTENTION_THRESHOLDS = {
  warning: 5,
  serious: 10,
} as const

/**
 * Default size of the per-cluster "top contended VMs" list. Used by
 * `topReadinessVmsByCluster` in the aggregator and consumed by the PPTX
 * annex slide and the dashboard sub-section.
 *
 * Tuned for one PPTX annex slide: 10 rows fit comfortably in the table
 * geometry (rowH 0.45 in × 10 = 4.5 in vertical) without spilling into
 * the legend or footer. Bumping this requires re-tuning the slide
 * layout in `contentionAnnex.ts`.
 */
export const TOP_N_DEFAULT = 10
