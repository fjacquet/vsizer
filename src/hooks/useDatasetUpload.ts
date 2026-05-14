import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { aggregateClusters } from '../engines/aggregation/aggregateClusters'
import { aggregateGlobals } from '../engines/aggregation/globals'
import { extractWorkbookBytes, ZipExtractError } from '../engines/parser/extractWorkbook'
import { parseDataset } from '../engines/parser/normalizeColumns'
import {
  type FileScopedRows,
  resolveClusterCollisions,
} from '../engines/parser/resolveClusterCollisions'
import { useDatasetStore } from '../store/datasetStore'
import type { SourceFile } from '../types'

/**
 * Drives the parse → aggregate → store-population pipeline kicked off
 * when a user drops one or more files. Surfaces a status flag so the
 * dropzone can disable itself while parsing.
 *
 * Privacy invariant (ADR-0001): each file body is read into a single
 * `ArrayBuffer`, parsed synchronously, and the aggregates land in the
 * Zustand store. The buffers are dropped after parse — they're never
 * sent over the network. Multi-file batches (ADR-0017) reuse the same
 * pipeline per file and concatenate the resulting rows into one store
 * write.
 */
export function useDatasetUpload(): {
  isUploading: boolean
  uploadFiles(files: File[]): Promise<void>
} {
  const { t } = useTranslation(['upload', 'validation'])
  const setMergedDataset = useDatasetStore((s) => s.setMergedDataset)
  const [isUploading, setIsUploading] = useState(false)

  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return
      setIsUploading(true)
      try {
        const perFile: FileScopedRows[] = []
        const sources: SourceFile[] = []
        const parseErrors: {
          file: string
          sheet: 'vinfo' | 'vhost'
          index: number
          message: string
        }[] = []
        let totalRowErrors = 0

        for (const file of files) {
          try {
            const buffer = await file.arrayBuffer()
            // Live Optics ships a 5-file zip; extract the *_VMWARE_*.xlsx
            // entry before parsing. Plain .xlsx uploads pass through.
            const workbookBytes = extractWorkbookBytes(buffer, file.name)
            const parsed = parseDataset(workbookBytes)
            if (parsed.source === 'unknown') {
              toast.error(t('validation:source.unknown'), { description: file.name })
              continue
            }
            perFile.push({ filename: file.name, vinfo: parsed.vinfo, vhost: parsed.vhost })
            sources.push({
              name: file.name,
              size: file.size,
              source: parsed.source,
              vinfoRows: parsed.vinfo.length,
              vhostRows: parsed.vhost.length,
            })
            for (const err of parsed.errors) {
              parseErrors.push({
                file: file.name,
                sheet: err.sheet,
                index: err.index,
                message: err.message,
              })
            }
            totalRowErrors += parsed.errors.length
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (err instanceof ZipExtractError) {
              toast.error(t('upload:errors.zipExtractFailed', { message: msg }), {
                description: file.name,
              })
            } else {
              toast.error(t('upload:errors.parseFailed', { message: msg }), {
                description: file.name,
              })
            }
          }
        }

        // All files failed → leave the store untouched, surface nothing
        // beyond the per-file error toasts already emitted.
        if (perFile.length === 0) return

        const { vinfo, vhost } = resolveClusterCollisions(perFile)

        const stretchedClusters = useDatasetStore.getState().stretchedClusters
        const clusters = aggregateClusters({ vinfo, vhost, stretchedClusters })
        if (clusters.length === 0) {
          toast.error(t('validation:rows.noClusters'))
          return
        }

        const aggregates: Record<string, (typeof clusters)[number]> = {}
        for (const cluster of clusters) aggregates[cluster.cluster] = cluster
        const globals = aggregateGlobals(clusters)

        // Top-level source: first file's format. Mixed-source datasets
        // still work because per-row nullable fields (e.g.
        // `cpuReadinessPercent`) handle the asymmetry (ADR-0012).
        const firstSource = sources[0]
        const topLevelSource = firstSource?.source ?? 'unknown'

        setMergedDataset({
          sources,
          source: topLevelSource,
          vinfo,
          vhost,
          parseErrors,
          aggregates,
          globals,
        })

        if (totalRowErrors > 0) {
          toast.warning(t('validation:rows.noVms'), {
            description: `${totalRowErrors} rows skipped`,
          })
        }
      } finally {
        setIsUploading(false)
      }
    },
    [setMergedDataset, t],
  )

  return { isUploading, uploadFiles }
}
