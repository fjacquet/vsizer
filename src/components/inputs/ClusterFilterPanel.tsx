import { useTranslation } from 'react-i18next'
import type { ClusterAggregate } from '../../types'

export interface ClusterFilterPanelProps {
  clusters: readonly ClusterAggregate[]
  /** Current selection. Empty set means "all clusters" by V1 contract. */
  selected: ReadonlySet<string>
  onToggle(cluster: string): void
  onSelectNone(): void
}

/**
 * Sidebar checkbox list. Default state is "all clusters" — visually each
 * checkbox is checked because the empty-set means everything (selectIsSelected
 * in the store treats `size === 0` as truthy).
 *
 * The single allowed dashboard interaction (PRD §5.3 / ADR-0006).
 */
export function ClusterFilterPanel({
  clusters,
  selected,
  onToggle,
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
          <h3 id="cluster-filter-heading" className="text-sm font-semibold text-slate-100">
            {t('filter.title')}
          </h3>
          <p className="text-xs text-slate-400">
            {t('filter.selectedCount', { count: explicitCount })}
            {selected.size === 0 ? ` · ${t('filter.allDefault')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onSelectNone}
          className="text-xs text-slate-400 underline-offset-2 hover:underline disabled:opacity-50"
          disabled={selected.size === 0}
        >
          {tc('actions.selectNone')}
        </button>
      </header>
      <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-1">
        {clusters.map((cluster) => {
          const checked = isChecked(cluster.cluster)
          return (
            <li key={cluster.cluster}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(cluster.cluster)}
                  className="h-4 w-4 accent-accent-500"
                  aria-label={cluster.cluster}
                />
                <span className="flex-1 truncate text-slate-200">{cluster.cluster}</span>
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
