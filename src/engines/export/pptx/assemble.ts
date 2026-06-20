// src/engines/export/pptx/assemble.ts
import { topReadinessVmsByCluster } from '../../aggregation/vinfoMerge'
import type { IngestResult } from '../../ingest'
import type { BuildPptxInput, PptxStrings } from './builder'

export function assembleBuildPptxInput(
  dataset: Pick<IngestResult, 'globals' | 'aggregates' | 'vhost' | 'vinfo'>,
  strings: PptxStrings,
  selectedClusters: ReadonlySet<string> = new Set(),
): BuildPptxInput {
  const all = Object.values(dataset.aggregates).sort((a, b) => a.cluster.localeCompare(b.cluster))
  const clusters = selectedClusters.size === 0 ? all : all.filter((c) => selectedClusters.has(c.cluster))
  return {
    globals: dataset.globals,
    clusters,
    vhost: dataset.vhost,
    topReadinessByCluster: topReadinessVmsByCluster(dataset.vinfo),
    strings,
  }
}
