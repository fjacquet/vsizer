import { useTranslation } from 'react-i18next'
import { isOrphanCluster } from '../../engines/parser/synthesizeOrphanClusters'
import type { ClusterAggregate } from '../../types'

export interface ClusterFilterPanelProps {
  clusters: readonly ClusterAggregate[]
  /** Current selection. Empty set means "all clusters" by V1 contract. */
  selected: ReadonlySet<string>
  /** Set of cluster names marked as stretched (ADR-0007). */
  stretched: ReadonlySet<string>
  onToggle(cluster: string): void
  onToggleStretched(cluster: string): void
  onSelectNone(): void
}

/**
 * Sidebar checkbox list. Default state is "all clusters" — visually each
 * checkbox is checked because the empty-set means everything (selectIsSelected
 * in the store treats `size === 0` as truthy).
 *
 * Each row also carries a small "DR" pill that toggles the stretched-cluster
 * flag (ADR-0007). The DR action is independent from the export checkbox —
 * a stretched cluster can be excluded from the export and vice versa.
 */
export function ClusterFilterPanel({
  clusters,
  selected,
  stretched,
  onToggle,
  onToggleStretched,
  onSelectNone,
}: ClusterFilterPanelProps) {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation('common')

  if (clusters.length === 0) return null

  // V1: an empty selection set means "all clusters". The checked state for a
  // given cluster is therefore: size===0 OR explicit membership.
  const isChecked = (name: string): boolean => selected.size === 0 || selected.has(name)
  const explicitCount = selected.size === 0 ? clusters.length : selected.size

  return (
    <section className="panel" aria-labelledby="cluster-filter-heading">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3
            id="cluster-filter-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            {t('filter.title')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('filter.selectedCount', { count: explicitCount })}
            {selected.size === 0 ? ` · ${t('filter.allDefault')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onSelectNone}
          className="text-xs text-slate-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-400"
          disabled={selected.size === 0}
        >
          {tc('actions.selectNone')}
        </button>
      </header>
      <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-1">
        {clusters.map((cluster) => {
          const checked = isChecked(cluster.cluster)
          const isStretched = stretched.has(cluster.cluster)
          // A synthesized "(no cluster) <hostName>" row represents a
          // single standalone host — the 2-site stretched DR
          // reservation (ADR-0007) has no meaning for one box, so
          // the toggle is omitted entirely. See ADR-0014.
          const allowStretch = !isOrphanCluster(cluster.cluster)
          return (
            <li key={cluster.cluster}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-surface-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(cluster.cluster)}
                  className="h-4 w-4 accent-accent-500"
                  aria-label={cluster.cluster}
                />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                  {cluster.cluster}
                </span>
                {allowStretch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      // Stop the click from bubbling up to the <label> and
                      // toggling the export checkbox.
                      e.preventDefault()
                      e.stopPropagation()
                      onToggleStretched(cluster.cluster)
                    }}
                    aria-pressed={isStretched}
                    aria-label={
                      isStretched ? t('filter.unmarkStretched') : t('filter.markStretched')
                    }
                    title={tc('badge.stretchedFull')}
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      isStretched
                        ? 'border-accent-500 bg-accent-500 text-primary-900'
                        : 'border-slate-300 text-slate-500 hover:border-accent-500 hover:text-accent-500 dark:border-surface-700'
                    }`}
                  >
                    {t('filter.drPillLabel')}
                  </button>
                )}
                <span className="text-[11px] text-slate-500">
                  {cluster.hostCount}h · {cluster.vmCount}v
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
