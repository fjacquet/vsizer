import { aggregateClusters } from './aggregation/aggregateClusters'
import { aggregateGlobals } from './aggregation/globals'
import { extractWorkbookBytes } from './parser/extractWorkbook'
import { parseDataset } from './parser/normalizeColumns'
import { resolveClusterCollisions, type FileScopedRows } from './parser/resolveClusterCollisions'
import type { SourceFormat } from './parser/detectSource'
import type { ClusterAggregate, GlobalSummary, SourceFile, VHostRow, VInfoRow } from '../types'

export class IngestError extends Error {
  constructor(
    public readonly code: 'NO_SOURCE' | 'NO_CLUSTERS',
    message: string,
  ) {
    super(message)
    this.name = 'IngestError'
  }
}

export interface IngestFile {
  name: string
  size?: number
  bytes: ArrayBuffer | Uint8Array
}

export interface IngestResult {
  sources: SourceFile[]
  source: SourceFormat
  vinfo: VInfoRow[]
  vhost: VHostRow[]
  aggregates: Record<string, ClusterAggregate>
  globals: GlobalSummary
  parseErrors: Array<{ file: string; sheet: 'vinfo' | 'vhost'; index: number; message: string }>
}

export function ingestDataset(
  files: IngestFile[],
  stretchedClusters: ReadonlySet<string> = new Set(),
): IngestResult {
  const perFile: FileScopedRows[] = []
  const sources: SourceFile[] = []
  const parseErrors: IngestResult['parseErrors'] = []

  for (const file of files) {
    const workbookBytes = extractWorkbookBytes(file.bytes, file.name)
    const parsed = parseDataset(workbookBytes)
    if (parsed.source === 'unknown') continue
    perFile.push({ filename: file.name, vinfo: parsed.vinfo, vhost: parsed.vhost })
    sources.push({
      name: file.name,
      size: file.size ?? 0,
      source: parsed.source,
      vinfoRows: parsed.vinfo.length,
      vhostRows: parsed.vhost.length,
    })
    for (const err of parsed.errors) {
      parseErrors.push({ file: file.name, sheet: err.sheet, index: err.index, message: err.message })
    }
  }

  if (perFile.length === 0) throw new IngestError('NO_SOURCE', 'No file parsed to a known RVTools/LiveOptics source')

  const { vinfo, vhost } = resolveClusterCollisions(perFile)
  const clusters = aggregateClusters({ vinfo, vhost, stretchedClusters })
  if (clusters.length === 0) throw new IngestError('NO_CLUSTERS', 'No clusters found in the dataset')

  const aggregates: Record<string, ClusterAggregate> = {}
  for (const cluster of clusters) aggregates[cluster.cluster] = cluster

  return {
    sources,
    source: sources[0]!.source,
    vinfo,
    vhost,
    aggregates,
    globals: aggregateGlobals(clusters),
    parseErrors,
  }
}
