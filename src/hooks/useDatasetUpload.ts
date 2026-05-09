import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { aggregateClusters } from '../engines/aggregation/aggregateClusters'
import { aggregateGlobals } from '../engines/aggregation/globals'
import { extractWorkbookBytes, ZipExtractError } from '../engines/parser/extractWorkbook'
import { parseDataset } from '../engines/parser/normalizeColumns'
import { useDatasetStore } from '../store/datasetStore'

/**
 * Drives the parse → aggregate → store-population pipeline kicked off when
 * a user drops a file. Surfaces a status flag so the dropzone can disable
 * itself while parsing.
 *
 * Privacy invariant (ADR-0001): the file body is read into a single
 * `ArrayBuffer`, parsed synchronously, and the aggregates land in the
 * Zustand store. The buffer is dropped after parse — it's never sent
 * over the network.
 */
export function useDatasetUpload(): {
  isUploading: boolean
  uploadFile(file: File): Promise<void>
} {
  const { t } = useTranslation(['upload', 'validation'])
  const setDataset = useDatasetStore((s) => s.setDataset)
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File): Promise<void> => {
      setIsUploading(true)
      try {
        const buffer = await file.arrayBuffer()
        // Live Optics ships a 5-file zip; extract the *_VMWARE_*.xlsx entry
        // before parsing. Plain .xlsx uploads pass through untouched.
        const workbookBytes = extractWorkbookBytes(buffer, file.name)
        const parsed = parseDataset(workbookBytes)
        if (parsed.source === 'unknown') {
          toast.error(t('validation:source.unknown'))
          return
        }

        // A fresh upload resets the stretched set (setDataset wipes it),
        // but reading it here keeps the API consistent if a future "reload
        // same file" path skips setDataset.
        const stretchedClusters = useDatasetStore.getState().stretchedClusters
        const clusters = aggregateClusters({
          vinfo: parsed.vinfo,
          vhost: parsed.vhost,
          stretchedClusters,
        })
        if (clusters.length === 0) {
          toast.error(t('validation:rows.noClusters'))
          return
        }

        const aggregates: Record<string, (typeof clusters)[number]> = {}
        for (const cluster of clusters) aggregates[cluster.cluster] = cluster
        const globals = aggregateGlobals(clusters)

        setDataset({ file, parsed, aggregates, globals })

        if (parsed.errors.length > 0) {
          toast.warning(t('validation:rows.noVms'), {
            description: `${parsed.errors.length} rows skipped`,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (err instanceof ZipExtractError) {
          toast.error(t('upload:errors.zipExtractFailed', { message: msg }))
        } else {
          toast.error(t('upload:errors.parseFailed', { message: msg }))
        }
      } finally {
        setIsUploading(false)
      }
    },
    [setDataset, t],
  )

  return { isUploading, uploadFile }
}
