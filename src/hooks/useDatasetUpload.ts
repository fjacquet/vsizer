import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { extractWorkbookBytes, ZipExtractError } from '../engines/parser/extractWorkbook'
import { ingestDataset, IngestError, type IngestFile, type IngestResult } from '../engines/ingest'
import { useDatasetStore } from '../store/datasetStore'

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
        const ingestFiles: IngestFile[] = []

        for (const file of files) {
          try {
            const buffer = await file.arrayBuffer()
            // Live Optics ships a 5-file zip; extract the *_VMWARE_*.xlsx
            // entry before parsing. Plain .xlsx uploads pass through.
            const workbookBytes = extractWorkbookBytes(buffer, file.name)
            ingestFiles.push({ name: file.name, size: file.size, bytes: workbookBytes })
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

        if (ingestFiles.length === 0) return

        let result: IngestResult
        try {
          result = ingestDataset(ingestFiles, useDatasetStore.getState().stretchedClusters)
        } catch (err) {
          if (err instanceof IngestError) {
            const msg = err.message
            if (msg.includes('No clusters')) {
              toast.error(t('validation:rows.noClusters'))
            } else {
              toast.error(t('validation:source.unknown'))
            }
            return
          }
          throw err
        }

        // Surface per-file unknown-source toasts by comparing ingest input
        // to the sources that successfully parsed (ADR-0017).
        const succeededNames = new Set(result.sources.map((s) => s.name))
        for (const f of ingestFiles) {
          if (!succeededNames.has(f.name)) {
            toast.error(t('validation:source.unknown'), { description: f.name })
          }
        }

        // Top-level source: first file's format. Mixed-source datasets
        // still work because per-row nullable fields (e.g.
        // `cpuReadinessPercent`) handle the asymmetry (ADR-0012).
        setMergedDataset({
          sources: result.sources,
          source: result.source,
          vinfo: result.vinfo,
          vhost: result.vhost,
          parseErrors: result.parseErrors,
          aggregates: result.aggregates,
          globals: result.globals,
        })

        const totalRowErrors = result.parseErrors.length
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
