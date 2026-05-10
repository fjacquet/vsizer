import { useTranslation } from 'react-i18next'
import type { TopReadinessVm } from '../../engines/aggregation/vinfoMerge'
import { contentionColor, usageColor } from '../../engines/export/pptx/primitives/colors'
import { THEME } from '../../engines/export/pptx/theme'
import type { ClusterAggregate, VHostRow } from '../../types'
import {
  fmtGhzValue,
  fmtInt,
  fmtMemMb,
  fmtMhzValue,
  fmtPercent,
  fmtPercentValue,
  fmtPercentWhole,
  fmtRatio,
} from '../../utils/format'
import { KpiCard } from '../common/KpiCard'
import { StretchedBadge } from '../common/StretchedBadge'
import { UtilizationBar } from '../common/UtilizationBar'
import { ContentionAnnex } from './ContentionAnnex'

export interface ClusterCardProps {
  cluster: ClusterAggregate
  /** Subset of vhost rows belonging to this cluster — used for the header
   *  facts (cores, GHz/core, RAM) the dashboard shows but the aggregate
   *  doesn't carry. */
  hostsInCluster: readonly VHostRow[]
  /** Top-N most-contended VMs in this cluster, sorted desc by readiness.
   *  Empty / absent → no annex sub-section is rendered. ADR-0012 §4. */
  topReadinessVms?: ReadonlyArray<TopReadinessVm>
}

const computeFacts = (
  hostsInCluster: readonly VHostRow[],
  cluster: ClusterAggregate,
): {
  totalCores: number
  speedMhzAvg: number
  /** Physical host RAM (sum of host.memoryMb), read off the aggregate. */
  physicalRamMb: number
} => {
  if (hostsInCluster.length === 0) {
    return { totalCores: 0, speedMhzAvg: 0, physicalRamMb: cluster.physicalRamMb }
  }
  const totalCores = hostsInCluster.reduce((s, h) => s + h.cores, 0)
  const speedMhzAvg = hostsInCluster.reduce((s, h) => s + h.speedMhz, 0) / hostsInCluster.length
  return { totalCores, speedMhzAvg, physicalRamMb: cluster.physicalRamMb }
}

interface UtilBlockProps {
  title: string
  subtitle: string
  ratioMean: number
  ratioMax: number
  ratioMin: number
  labels: { min: string; mean: string; max: string }
}

function UtilBlock({ title, subtitle, ratioMean, ratioMax, ratioMin, labels }: UtilBlockProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-surface-700 dark:bg-surface-900/40">
      <header>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </header>
      <UtilizationBar ratio={ratioMean} peak={ratioMax} heightPx={14} label={title} />
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>0 %</span>
        <span>100 %</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center dark:border-surface-700">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">{labels.min}</dt>
          <dd className="text-base font-semibold text-slate-700 dark:text-slate-300">
            {fmtPercentWhole(ratioMin)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">{labels.mean}</dt>
          <dd className="text-lg font-bold" style={{ color: `#${usageColor(ratioMean)}` }}>
            {fmtPercent(ratioMean)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">{labels.max}</dt>
          <dd className="text-base font-semibold text-slate-700 dark:text-slate-300">
            {fmtPercentWhole(ratioMax)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Per-cluster card. Mirrors the PPTX cluster slide section-for-section
 * (header → 4 KPI cards → 2 utilization blocks → factual data banner) so
 * the dashboard preview equals the deck preview (ADR-0006).
 *
 * **No editorial language**: no "ronronne", no "RESIZE EN GHZ", no
 * "Marge libérable" — the bottom banner is a neutral 4-tile data strip
 * (ADR-0003).
 */
export function ClusterCard({ cluster, hostsInCluster, topReadinessVms }: ClusterCardProps) {
  const { t } = useTranslation('dashboard')
  const facts = computeFacts(hostsInCluster, cluster)
  const showContentionAnnex =
    cluster.readinessAvailable &&
    cluster.vmsAboveReadinessWarning > 0 &&
    (topReadinessVms?.length ?? 0) > 0

  const reservedGhz = (cluster.vcpuAllocated * facts.speedMhzAvg) / 1000

  const headerSubtitleBase = t('card.headerSubtitle', {
    hosts: fmtInt(cluster.hostCount),
    vms: fmtInt(cluster.vmCount),
    cores: fmtInt(facts.totalCores),
    ghzPerCore: facts.speedMhzAvg > 0 ? `${(facts.speedMhzAvg / 1000).toFixed(2)} GHz/core` : '—',
    ram: fmtMemMb(facts.physicalRamMb),
  })
  const headerSubtitle = cluster.stretched
    ? headerSubtitleBase +
      t('card.headerSubtitleStretchedSuffix', {
        ghzReserved: fmtGhzValue(cluster.drReservedGhz),
        ramReserved: fmtMemMb(cluster.drReservedRamMb),
      })
    : headerSubtitleBase

  return (
    <article
      className="panel flex flex-col gap-5"
      aria-labelledby={`cluster-${cluster.cluster}-heading`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-3 dark:border-surface-700">
        <h3
          id={`cluster-${cluster.cluster}-heading`}
          className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-slate-100"
        >
          {cluster.cluster}
          {cluster.stretched ? <StretchedBadge /> : null}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{headerSubtitle}</p>
      </header>

      {/* CPU Ready (contention) line — mirrors the PPTX cluster slide
          (ADR-0012). When the source supplies readiness, render the
          mean / max / count tuple with mean colorized via
          contentionColor. Otherwise render the asymmetric-source
          mention so the absence of data never reads as "all healthy". */}
      {cluster.readinessAvailable && cluster.meanCpuReadinessPercent !== null ? (
        <p
          className="text-sm font-semibold"
          style={{ color: `#${contentionColor(cluster.meanCpuReadinessPercent)}` }}
        >
          {t('card.contentionLine.available', {
            mean: fmtPercentValue(cluster.meanCpuReadinessPercent),
            max: fmtPercentValue(cluster.maxCpuReadinessPercent ?? cluster.meanCpuReadinessPercent),
            count: cluster.vmsAboveReadinessWarning,
          })}
        </p>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('card.contentionLine.unavailable', {
            source: t('card.contentionLine.sourceLiveOptics'),
          })}
        </p>
      )}

      {/* Row 1: 5 KPI cards (vCPU/pCPU added — DR-aware ratio per ADR-0009) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          accent={usageColor(cluster.meanCpuRatio)}
          big={fmtPercentWhole(cluster.meanCpuRatio)}
          small={t('card.kpi.cpuMean')}
        />
        <KpiCard
          accent={usageColor(cluster.meanRamRatio)}
          big={fmtPercentWhole(cluster.meanRamRatio)}
          small={t('card.kpi.ramMean')}
        />
        <KpiCard
          accent={THEME.navy}
          big={`${fmtInt(cluster.consumedGhz)} / ${fmtInt(cluster.physicalGhz)}`}
          small={t('card.kpi.ghzUsedVsPhys')}
        />
        <KpiCard
          accent={THEME.teal}
          big={fmtMhzValue(cluster.mhzPerVcpu)}
          small={t('card.kpi.mhzPerVcpu')}
        />
        <KpiCard
          accent={THEME.teal}
          big={fmtRatio(cluster.vcpuPerPcpu)}
          small={t('card.kpi.vcpuPerPcpu')}
        />
      </div>

      {/* Row 2: 2 utilization blocks (subtitles call out DR reservation when stretched) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UtilBlock
          title={t('card.blocks.cpuTitle')}
          subtitle={
            t('card.blocks.cpuSubtitle', {
              consumed: fmtGhzValue(cluster.consumedGhz),
              physical: fmtGhzValue(cluster.physicalGhz),
            }) +
            (cluster.stretched
              ? t('card.blocks.drSuffix', {
                  reserved: fmtGhzValue(cluster.drReservedGhz),
                })
              : '')
          }
          ratioMean={cluster.meanCpuRatio}
          ratioMax={cluster.maxCpuRatio}
          ratioMin={cluster.minCpuRatio}
          labels={{
            min: t('card.blocks.min'),
            mean: t('card.blocks.mean'),
            max: t('card.blocks.max'),
          }}
        />
        <UtilBlock
          title={t('card.blocks.ramTitle')}
          subtitle={
            t('card.blocks.ramSubtitle', {
              consumed: fmtMemMb(cluster.consumedRamMb),
              physical: fmtMemMb(cluster.physicalRamMb),
            }) +
            (cluster.stretched
              ? t('card.blocks.drSuffix', {
                  reserved: fmtMemMb(cluster.drReservedRamMb),
                })
              : '')
          }
          ratioMean={cluster.meanRamRatio}
          ratioMax={cluster.maxRamRatio}
          ratioMin={cluster.minRamRatio}
          labels={{
            min: t('card.blocks.min'),
            mean: t('card.blocks.mean'),
            max: t('card.blocks.max'),
          }}
        />
      </div>

      {/* Row 3: factual data banner — replaces the editorial Python panel */}
      <div className="rounded-lg bg-primary-900 p-5 text-slate-100">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-500">
          {t('card.banner.title')}
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ice">{t('card.banner.vcpuAllocated')}</dt>
            <dd className="text-xl font-bold text-accent-500">{fmtInt(cluster.vcpuAllocated)}</dd>
          </div>
          <div>
            <dt className="whitespace-pre-line text-xs text-ice">
              {t('card.banner.reservedCapacity')}
            </dt>
            <dd className="text-xl font-bold text-accent-500">{fmtGhzValue(reservedGhz)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ice">{t('card.banner.consumedGhz')}</dt>
            <dd className="text-xl font-bold text-accent-500">
              {fmtGhzValue(cluster.consumedGhz)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ice">{t('card.banner.availableGhz')}</dt>
            <dd
              className={`text-xl font-bold ${
                cluster.availableGhz < 0 ? 'text-util-high' : 'text-accent-500'
              }`}
            >
              {fmtGhzValue(cluster.availableGhz)}
            </dd>
          </div>
        </dl>
      </div>

      {/* RAM-disponible line — DR-aware, mirrors the PPTX (ADR-0007). */}
      <p
        className={`text-sm font-semibold ${
          cluster.availableRamMb < 0 ? 'text-util-high' : 'text-slate-700 dark:text-slate-200'
        }`}
      >
        {t('card.ramAvailable', { value: fmtMemMb(cluster.availableRamMb) })}
      </p>

      {/* Conditional CPU Ready annex — mirrors the PPTX top-N annex
          slide. Three guards (ADR-0012 §4): readinessAvailable, count
          above warning, non-empty top-N list. */}
      {showContentionAnnex && topReadinessVms ? <ContentionAnnex topVms={topReadinessVms} /> : null}
    </article>
  )
}
