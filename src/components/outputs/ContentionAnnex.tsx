import { useTranslation } from 'react-i18next'
import { CONTENTION_THRESHOLDS } from '../../engines/aggregation/contention'
import type { TopReadinessVm } from '../../engines/aggregation/vinfoMerge'
import { contentionColor } from '../../engines/export/pptx/primitives/colors'
import { THEME } from '../../engines/export/pptx/theme'
import { fmtInt, fmtPercentValue } from '../../utils/format'

export interface ContentionAnnexProps {
  /** Top-N most-contended VMs in the cluster, sorted desc by readiness.
   *  Caller is expected to pass a non-empty list — the component does
   *  not branch on emptiness; the parent (ClusterCard) handles the
   *  conditional render. */
  topVms: ReadonlyArray<TopReadinessVm>
}

/**
 * Per-cluster sub-section listing the most-contended VMs (CPU Ready %),
 * mirroring the PPTX annex slide (ADR-0012 §4). Rendered as a sibling of
 * the cluster card's main body when the parent decides the cluster has
 * crossed the warning threshold.
 *
 * Layout: small panel with header + table + reference legend. Color
 * coding via `contentionColor` (shared with the deck — same thresholds).
 * Per ADR-0003, no editorial framing in any string.
 */
export function ContentionAnnex({ topVms }: ContentionAnnexProps) {
  const { t } = useTranslation('dashboard')

  // Defensive guard mirroring `addContentionAnnexSlide` — rendering a
  // zero-row table yields an empty section with a header, a column
  // strip and a legend, which reads as a UI bug. The only caller
  // (ClusterCard) already gates this; locking it here keeps the
  // contract local. Hunter L3.
  if (topVms.length === 0) return null

  return (
    <section
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-surface-700 dark:bg-surface-900/40"
      aria-label={t('contention.title')}
    >
      <header className="mb-3 flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('contention.title')}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('contention.subtitle')}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-surface-700 dark:text-slate-400">
              <th className="py-2 pr-2 text-left font-semibold">{t('contention.columns.rank')}</th>
              <th className="py-2 pr-2 text-left font-semibold">
                {t('contention.columns.vmName')}
              </th>
              <th className="py-2 pr-2 text-right font-semibold">{t('contention.columns.vcpu')}</th>
              <th className="py-2 pr-2 text-right font-semibold">
                {t('contention.columns.readiness')}
              </th>
            </tr>
          </thead>
          <tbody>
            {topVms.map((vm, i) => (
              <tr
                // VM names are unique within a cluster in vSphere; combine
                // with cluster for safety on the rare cross-cluster case
                // (the dashboard always slices per-cluster but the type
                // doesn't enforce it). Avoid index-as-key per React docs.
                key={`${vm.cluster}/${vm.vmName}`}
                className={
                  i % 2 === 0
                    ? 'bg-white dark:bg-surface-900/60'
                    : 'bg-slate-50 dark:bg-surface-900/30'
                }
              >
                <td className="py-2 pr-2 text-xs text-slate-500 dark:text-slate-400">{i + 1}</td>
                <td className="py-2 pr-2 font-medium text-slate-900 dark:text-slate-100">
                  {vm.vmName}
                </td>
                <td className="py-2 pr-2 text-right text-slate-700 dark:text-slate-300">
                  {fmtInt(vm.vcpu)}
                </td>
                <td
                  className="py-2 pr-2 text-right font-bold"
                  style={{ color: `#${contentionColor(vm.cpuReadinessPercent)}` }}
                >
                  {fmtPercentValue(vm.cpuReadinessPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Reference legend with three colored swatches — bare cutoffs only,
          no adjectives per ADR-0003. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{t('contention.legendReference')}</span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: `#${THEME.green}` }}
            aria-hidden="true"
          />
          <span>{t('contention.legend.low')}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: `#${THEME.orange}` }}
            aria-hidden="true"
          />
          <span>{t('contention.legend.mid')}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: `#${THEME.red}` }}
            aria-hidden="true"
          />
          <span>{t('contention.legend.high')}</span>
        </span>
      </div>
      {/* Defensive: pin the threshold reference back to the shared module
          so a translator who edits the legend strings doesn't drift away
          from the actual cutoffs the aggregator uses. */}
      <span className="sr-only">
        {`thresholds: warning=${CONTENTION_THRESHOLDS.warning}, serious=${CONTENTION_THRESHOLDS.serious}`}
      </span>
    </section>
  )
}
