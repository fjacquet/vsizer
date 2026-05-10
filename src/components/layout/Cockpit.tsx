import { useMemo } from 'react'
import { topReadinessVmsByCluster } from '../../engines/aggregation/vinfoMerge'
import { sortAggregates, useDatasetStore } from '../../store/datasetStore'
import { ClusterCard } from '../outputs/ClusterCard'
import { GlobalKpiBar } from '../outputs/GlobalKpiBar'
import { OverviewTable } from '../outputs/OverviewTable'
import { UploadSidebar } from './UploadSidebar'

/**
 * Loaded-state layout: sidebar (320 px on ≥ 1024 px, stacked on top below)
 * + a vertical main pane with `GlobalKpiBar → OverviewTable → ClusterCards`
 * in the same order as the PPTX deck (ADR-0006).
 */
export function Cockpit() {
  const globals = useDatasetStore((s) => s.globals)
  const aggregates = useDatasetStore((s) => s.aggregates)
  const vinfo = useDatasetStore((s) => s.vinfo)
  const vhost = useDatasetStore((s) => s.vhost)
  const clusters = useMemo(() => sortAggregates(aggregates), [aggregates])

  // CPU Ready top-N per cluster, computed once per dataset. Empty for
  // Live Optics inputs (all readiness values are null) — see ADR-0012 §4.
  // Same helper feeds the PPTX export via useExport.
  const topReadinessByCluster = useMemo(() => topReadinessVmsByCluster(vinfo), [vinfo])

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-6 lg:flex-row">
      <UploadSidebar />
      <main className="flex flex-1 flex-col gap-5">
        {globals ? <GlobalKpiBar globals={globals} /> : null}
        <OverviewTable clusters={clusters} />
        <section className="flex flex-col gap-4">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.cluster}
              cluster={cluster}
              hostsInCluster={vhost.filter((h) => h.cluster === cluster.cluster)}
              topReadinessVms={topReadinessByCluster.get(cluster.cluster)}
            />
          ))}
        </section>
      </main>
    </div>
  )
}
