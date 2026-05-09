import PptxGenJS from 'pptxgenjs'
import type { ClusterAggregate, GlobalSummary, VHostRow } from '../../../types'
import { addClusterSlide, type ClusterSlideStrings } from './slides/clusterSlide'
import { addOverviewSlide, type OverviewSlideStrings } from './slides/overviewSlide'
import { addTitleSlide, type TitleSlideStrings } from './slides/titleSlide'

/**
 * Per-cluster host facts the cluster slide needs but which aren't in the
 * `ClusterAggregate` (we don't surface them on the dashboard). Computed
 * once by the builder from the host rows the parser already validated.
 */
export interface ClusterHostFacts {
  totalCores: number
  speedMhzAvg: number
  totalMemMb: number
}

export interface BuildPptxInput {
  /** Estate-wide rollup, drives the title slide and overview subtitle. */
  globals: GlobalSummary
  /** One per cluster the user wants in the export. */
  clusters: readonly ClusterAggregate[]
  /** Raw host rows used to compute cluster-slide-only host facts (cores, GHz/core, RAM). */
  vhost: readonly VHostRow[]
  /** All translated strings. Keep them in `pptx` namespace JSON files. */
  strings: PptxStrings
}

export interface PptxStrings {
  /** "vsizer — Utilisation des clusters". Drives the title slide title and the
   *  underlying file's metadata title. */
  deckTitle: string
  title: TitleSlideStrings
  overview: OverviewSlideStrings
  cluster: ClusterSlideStrings
}

/**
 * Compute the per-cluster host facts the cluster slide needs.
 * - `totalCores` = Σ cores across hosts in the cluster
 * - `speedMhzAvg` = mean nominal CPU speed across hosts in the cluster
 * - `totalMemMb` is **not** available in `VHostRow` (we only track CPU
 *   capacity), so we approximate it from `vramAllocatedMb` on the
 *   aggregate. Better than zero; revisit when `VHostRow` grows a memory
 *   field.
 */
const factsForCluster = (
  cluster: ClusterAggregate,
  vhost: readonly VHostRow[],
): ClusterHostFacts => {
  const matching = vhost.filter((h) => h.cluster === cluster.cluster)
  if (matching.length === 0) {
    return { totalCores: 0, speedMhzAvg: 0, totalMemMb: cluster.vramAllocatedMb }
  }
  const totalCores = matching.reduce((acc, h) => acc + h.cores, 0)
  const speedMhzAvg = matching.reduce((acc, h) => acc + h.speedMhz, 0) / matching.length
  return { totalCores, speedMhzAvg, totalMemMb: cluster.vramAllocatedMb }
}

/**
 * Assemble the PPTX deck from aggregated data. Returns the file as an
 * `ArrayBuffer` — the calling hook turns that into a Blob and triggers a
 * browser download.
 *
 * Slide order (factual mode — see ADR-0003):
 *   1.  Title slide      (1)
 *   2.  Overview slide   (1)
 *   3+. Cluster slides   (N, one per `clusters` entry)
 */
export const buildPptx = async (input: BuildPptxInput): Promise<ArrayBuffer> => {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 inches
  pptx.title = input.strings.deckTitle

  addTitleSlide(pptx, input.globals, input.strings.title)
  addOverviewSlide(pptx, input.clusters, input.strings.overview)
  for (const cluster of input.clusters) {
    const facts = factsForCluster(cluster, input.vhost)
    addClusterSlide(
      pptx,
      cluster,
      facts.totalCores,
      facts.speedMhzAvg,
      facts.totalMemMb,
      input.strings.cluster,
    )
  }

  // pptxgenjs returns `string | ArrayBuffer | Blob | Uint8Array` depending on
  // outputType; we explicitly request 'arraybuffer' so the cast is safe.
  const out = await pptx.write({ outputType: 'arraybuffer' })
  return out as ArrayBuffer
}
