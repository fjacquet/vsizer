import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDatasetUpload } from '../../hooks/useDatasetUpload'
import { sortAggregates, useDatasetStore } from '../../store/datasetStore'
import { ClusterFilterPanel } from '../inputs/ClusterFilterPanel'
import { FileDropzone } from '../inputs/FileDropzone'

/**
 * Left sidebar in the loaded state. Contains the (compact) dropzone for
 * dropping a different file and the cluster filter checkboxes that scope
 * the export.
 *
 * Layout-wise it's a fixed 320 px column on viewports ≥ 1024 px and a
 * full-width band above the main pane below that breakpoint (ADR-0006).
 */
export function UploadSidebar() {
  const { t } = useTranslation('upload')
  const { isUploading, uploadFile } = useDatasetUpload()
  const file = useDatasetStore((s) => s.file)
  const aggregates = useDatasetStore((s) => s.aggregates)
  const clusters = useMemo(() => sortAggregates(aggregates), [aggregates])
  const selected = useDatasetStore((s) => s.selectedClusters)
  const stretched = useDatasetStore((s) => s.stretchedClusters)
  const toggleCluster = useDatasetStore((s) => s.toggleCluster)
  const toggleStretched = useDatasetStore((s) => s.toggleStretched)
  const clearSelection = useDatasetStore((s) => s.clearSelection)

  return (
    <aside
      className="flex flex-col gap-4 lg:w-80 lg:shrink-0"
      aria-label={t('fileLoaded.ariaLabel')}
    >
      {file ? (
        <div className="panel text-xs">
          <p className="mb-1 font-semibold uppercase tracking-wider text-accent-500">
            {t('fileLoaded.ariaLabel')}
          </p>
          <p className="break-all text-slate-200">{file.name}</p>
          <p className="text-slate-500">{Math.round(file.size / 1024).toLocaleString()} kB</p>
        </div>
      ) : null}
      <FileDropzone
        onFile={(f) => {
          void uploadFile(f)
        }}
        disabled={isUploading}
        variant="compact"
      />
      <ClusterFilterPanel
        clusters={clusters}
        selected={selected}
        stretched={stretched}
        onToggle={toggleCluster}
        onToggleStretched={toggleStretched}
        onSelectNone={clearSelection}
      />
    </aside>
  )
}
