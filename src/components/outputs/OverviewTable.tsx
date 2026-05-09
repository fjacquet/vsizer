import { useTranslation } from 'react-i18next'
import type { ClusterAggregate } from '../../types'
import { fmtGhzValue, fmtInt, fmtMemMb, fmtPercentWhole } from '../../utils/format'
import { StretchedBadge } from '../common/StretchedBadge'
import { UtilizationBar } from '../common/UtilizationBar'

export interface OverviewTableProps {
  clusters: readonly ClusterAggregate[]
}

/**
 * Single-glance summary of the estate. One row per cluster, stacked
 * CPU + RAM bars with peak markers, "GHz disponibles" on the right
 * (renamed from the legacy "Marge libérable" — see ADR-0003).
 *
 * Uses semantic `<table>` markup for a11y; row order is whatever the
 * caller passed in (typically alphabetical, set by `aggregateClusters`).
 */
export function OverviewTable({ clusters }: OverviewTableProps) {
  const { t } = useTranslation('dashboard')

  if (clusters.length === 0) return null

  return (
    <section className="panel" aria-labelledby="overview-table-heading">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="overview-table-heading" className="text-lg font-semibold text-slate-100">
            {t('overview.title')}
          </h2>
          <p className="text-xs text-slate-400">{t('overview.subtitle')}</p>
        </div>
      </header>

      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[12%]" />
          <col />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-accent-500">
            <th scope="col" className="pb-2 font-semibold">
              {t('overview.columns.cluster')}
            </th>
            <th scope="col" className="pb-2 font-semibold">
              {t('overview.columns.hostsVms')}
            </th>
            <th scope="col" className="pb-2 font-semibold">
              CPU / RAM
            </th>
            <th scope="col" className="pb-2 font-semibold">
              {t('overview.meanPeak', { mean: 'moy', peak: 'pic' }).split('{{')[0]}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold">
              {t('overview.columns.available')}
            </th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {clusters.map((cluster, i) => (
            <tr key={cluster.cluster} className={i % 2 === 0 ? 'bg-surface-900/30' : ''}>
              <th scope="row" className="py-3 pr-2 font-semibold text-slate-100">
                <span className="inline-flex items-center gap-2">
                  {cluster.cluster}
                  {cluster.stretched ? <StretchedBadge /> : null}
                </span>
              </th>
              <td className="py-3 pr-2 text-xs text-slate-400">
                {fmtInt(cluster.hostCount)} · {fmtInt(cluster.vmCount)}
              </td>
              <td className="py-3 pr-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-[10px] font-bold tracking-wider text-slate-500">
                      {t('overview.columns.cpu')}
                    </span>
                    <UtilizationBar
                      ratio={cluster.meanCpuRatio}
                      peak={cluster.maxCpuRatio}
                      heightPx={6}
                      label={`CPU ${fmtPercentWhole(cluster.meanCpuRatio)}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-[10px] font-bold tracking-wider text-slate-500">
                      {t('overview.columns.ram')}
                    </span>
                    <UtilizationBar
                      ratio={cluster.meanRamRatio}
                      peak={cluster.maxRamRatio}
                      heightPx={6}
                      label={`RAM ${fmtPercentWhole(cluster.meanRamRatio)}`}
                    />
                  </div>
                </div>
              </td>
              <td className="py-3 pr-2 text-xs">
                <div>
                  <span className="text-slate-400">CPU</span>{' '}
                  {t('overview.meanPeak', {
                    mean: fmtPercentWhole(cluster.meanCpuRatio),
                    peak: fmtPercentWhole(cluster.maxCpuRatio),
                  })}
                </div>
                <div>
                  <span className="text-slate-400">RAM</span>{' '}
                  {t('overview.meanPeak', {
                    mean: fmtPercentWhole(cluster.meanRamRatio),
                    peak: fmtPercentWhole(cluster.maxRamRatio),
                  })}
                </div>
              </td>
              <td className="py-3 text-right font-semibold">
                <div className={cluster.availableGhz < 0 ? 'text-util-high' : 'text-slate-100'}>
                  {fmtGhzValue(cluster.availableGhz)}
                </div>
                <div
                  className={`text-xs ${
                    cluster.availableRamMb < 0 ? 'text-util-high' : 'text-slate-400'
                  }`}
                >
                  {fmtMemMb(cluster.availableRamMb)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
