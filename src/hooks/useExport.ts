import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { topReadinessVmsByCluster } from '../engines/aggregation/vinfoMerge'
import { buildPptx } from '../engines/export/pptx/builder'
import { useDatasetStore } from '../store/datasetStore'
import { usePptxStrings } from './usePptxStrings'

const triggerDownload = (data: ArrayBuffer, filename: string): void => {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // Defer revocation so the click handler completes before the URL goes.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

const todayIso = (): string => {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

const sanitizeBaseName = (name: string): string =>
  name
    .replace(/\.[^.]+$/, '') // drop extension
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64) || 'cluster_utilization'

/**
 * One-shot PPTX generator. Pulls the current dataset from the store, applies
 * the cluster filter, builds the deck, and triggers a browser download.
 *
 * Returns `{ canExport, isExporting, exportPptx }`. UI disables the trigger
 * when `canExport === false` or `isExporting === true`.
 */
export function useExport(): {
  canExport: boolean
  isExporting: boolean
  exportPptx(): Promise<void>
} {
  const { t } = useTranslation('common')
  const file = useDatasetStore((s) => s.file)
  const source = useDatasetStore((s) => s.source)
  const aggregates = useDatasetStore((s) => s.aggregates)
  const globals = useDatasetStore((s) => s.globals)
  const vinfo = useDatasetStore((s) => s.vinfo)
  const vhost = useDatasetStore((s) => s.vhost)
  const selectedClusters = useDatasetStore((s) => s.selectedClusters)

  const [isExporting, setIsExporting] = useState(false)

  const sourceFile = file?.name ?? '—'
  // ADR-0012 / Hunter H2: usePptxStrings needs the source format to
  // pick the right label for the "non disponible" line — picking
  // "Live Optics" on an RVTools file with the column missing
  // mis-attributes the cause of absence.
  const strings = usePptxStrings(sourceFile, todayIso(), source)

  // CPU Ready top-N is computed from the parsed vInfo rows once per
  // dataset (changes only when a new file is uploaded). Heavy enough
  // to memoize: O(n log n) sort per cluster across all powered-on VMs.
  // The map is empty for Live Optics inputs (all readiness values
  // null) — see ADR-0012 §4. Passed as a ReadonlyMap to buildPptx,
  // which conditionally injects the annex slide.
  const topReadinessByCluster = useMemo(() => topReadinessVmsByCluster(vinfo), [vinfo])

  const canExport = globals !== null && Object.keys(aggregates).length > 0

  const exportPptx = useCallback(async (): Promise<void> => {
    if (!canExport || globals === null) return
    setIsExporting(true)
    try {
      // Selection rule: empty set ⇒ "all clusters".
      const all = Object.values(aggregates).sort((a, b) => a.cluster.localeCompare(b.cluster))
      const filtered =
        selectedClusters.size === 0 ? all : all.filter((c) => selectedClusters.has(c.cluster))

      const data = await buildPptx({
        globals,
        clusters: filtered,
        vhost,
        topReadinessByCluster,
        strings,
      })

      triggerDownload(data, `${sanitizeBaseName(sourceFile)}_vsizer.pptx`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(t('error.title'), { description: msg })
    } finally {
      setIsExporting(false)
    }
  }, [
    aggregates,
    canExport,
    globals,
    selectedClusters,
    sourceFile,
    strings,
    t,
    topReadinessByCluster,
    vhost,
  ])

  return { canExport, isExporting, exportPptx }
}
