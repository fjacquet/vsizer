import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDatasetUpload } from '../../hooks/useDatasetUpload'
import { sortAggregates, useDatasetStore } from '../../store/datasetStore'
import { ClusterFilterPanel } from '../inputs/ClusterFilterPanel'
import { FileDropzone } from '../inputs/FileDropzone'
import { SourceFileList } from '../sources/SourceFileList'

/**
 * Left sidebar in the loaded state. Contains the (compact) dropzone for
 * dropping a different file and the cluster filter checkboxes that scope
 * the export.
 *
 * Layout-wise it's a fixed 320 px column on viewports ≥ 1024 px and a
 * full-width band above the main pane below that breakpoint (ADR-0006).
 *
 * Multi-file (ADR-0017): when more than one workbook is imported,
 * the single-file metadata panel is replaced by a `SourceFileList`
 * chip list.
 */
export function UploadSidebar() {
  const { t } = useTranslation('upload')
  const { isUploading, uploadFiles } = useDatasetUpload()
  const sources = useDatasetStore((s) => s.sources)
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
      <SourceFileList sources={sources} />
      <FileDropzone
        onFiles={(files) => {
          void uploadFiles(files)
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
