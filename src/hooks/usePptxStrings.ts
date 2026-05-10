import { useTranslation } from 'react-i18next'
import type { PptxStrings } from '../engines/export/pptx/builder'
import type { SourceFormat } from '../engines/parser/detectSource'

/**
 * Assemble a `PptxStrings` bag from i18next translations. Keeps the
 * builder pure (engine, no React) while letting the slide layout strings
 * live in JSON files reviewable by translators.
 *
 * Function-typed slots (subtitles) are wrappers around `t(..., vars)` so
 * the i18next interpolation runs at slide-build time with the actual
 * per-cluster numbers.
 *
 * `sourceFormat` is needed (since ADR-0012) to pick the right label for
 * the "CPU Ready : non disponible" line — Live Optics workbooks omit
 * the column entirely; older RVTools builds may also omit it. Picking
 * the wrong label confuses the speaker about the cause of absence.
 */
export function usePptxStrings(
  sourceFile: string,
  dateIso: string,
  sourceFormat: SourceFormat,
): PptxStrings {
  const { t } = useTranslation('pptx')

  // Pre-resolve the source label so the slide layer (which doesn't know
  // about SourceFormat) can render a single string. Live Optics is the
  // common case for absence; RVTools-without-column or unknown-source
  // fall through to the RVTools label since the user definitely
  // uploaded a non-LiveOptics file.
  const sourceLabel =
    sourceFormat === 'liveoptics'
      ? t('cluster.contentionLine.sourceLiveOptics')
      : t('cluster.contentionLine.sourceRvtools')

  return {
    deckTitle: t('deckTitle'),
    title: {
      title: t('title.title'),
      eyebrow: t('title.eyebrow'),
      subtitle: t('title.subtitle', { file: sourceFile, date: dateIso }),
      kpiLabels: {
        hosts: t('title.kpiLabels.hosts'),
        vms: t('title.kpiLabels.vms'),
        physicalGhz: t('title.kpiLabels.physicalGhz'),
        physicalRam: t('title.kpiLabels.physicalRam'),
        meanCpu: t('title.kpiLabels.meanCpu'),
      },
    },
    overview: {
      title: t('overview.title'),
      subtitle: t('overview.subtitle'),
      columns: {
        cluster: t('overview.columns.cluster'),
        hostsVms: t('overview.columns.hostsVms'),
        bars: t('overview.columns.bars'),
        meanPeak: t('overview.columns.meanPeak'),
        available: t('overview.columns.available'),
      },
      cpuLabel: t('overview.cpuLabel'),
      ramLabel: t('overview.ramLabel'),
      stretchedBadge: t('cluster.stretchedBadge'),
      legend: {
        title: t('overview.legend.title'),
        low: t('overview.legend.low'),
        mid: t('overview.legend.mid'),
        high: t('overview.legend.high'),
        peak: t('overview.legend.peak'),
      },
    },
    cluster: {
      subtitle: ({
        hostCount,
        vmCount,
        totalCoresFormatted,
        ghzPerCoreFormatted,
        physicalRamFormatted,
        stretched,
        drReservedGhzFormatted,
        drReservedRamFormatted,
      }) => {
        const base = t('cluster.subtitle', {
          hosts: hostCount,
          vms: vmCount,
          cores: totalCoresFormatted,
          ghzPerCore: ghzPerCoreFormatted,
          ram: physicalRamFormatted,
        })
        if (!stretched) return base
        return (
          base +
          t('cluster.subtitleStretchedSuffix', {
            ghzReserved: drReservedGhzFormatted,
            ramReserved: drReservedRamFormatted,
          })
        )
      },
      stretchedBadge: t('cluster.stretchedBadge'),
      ramAvailableLine: (formatted: string) => t('cluster.ramAvailableLine', { value: formatted }),
      cards: {
        cpuMean: t('cluster.cards.cpuMean'),
        ramMean: t('cluster.cards.ramMean'),
        ghzUsedVsPhys: t('cluster.cards.ghzUsedVsPhys'),
        mhzPerVcpu: t('cluster.cards.mhzPerVcpu'),
        vcpuPerPcpu: t('cluster.cards.vcpuPerPcpu'),
      },
      blocks: {
        cpuTitle: t('cluster.blocks.cpuTitle'),
        ramTitle: t('cluster.blocks.ramTitle'),
        cpuSubtitle: (consumed, physical, drSuffix) => {
          const base = t('cluster.blocks.cpuSubtitle', { consumed, physical })
          return drSuffix ? base + t('cluster.blocks.drSuffix', { reserved: drSuffix }) : base
        },
        ramSubtitle: (consumed, physical, drSuffix) => {
          const base = t('cluster.blocks.ramSubtitle', { consumed, physical })
          return drSuffix ? base + t('cluster.blocks.drSuffix', { reserved: drSuffix }) : base
        },
        min: t('cluster.blocks.min'),
        mean: t('cluster.blocks.mean'),
        max: t('cluster.blocks.max'),
      },
      banner: {
        title: t('cluster.banner.title'),
        vcpuAllocated: t('cluster.banner.vcpuAllocated'),
        reservedCapacity: t('cluster.banner.reservedCapacity'),
        consumedGhz: t('cluster.banner.consumedGhz'),
        availableGhz: t('cluster.banner.availableGhz'),
      },
      contentionLine: {
        available: ({ mean, max, count, threshold }) =>
          t('cluster.contentionLine.available', { mean, max, count, threshold }),
        // Pre-resolved against the actual SourceFormat so the slide
        // layer renders a single string and the deck never claims
        // "Live Optics" on an RVTools file with the column missing.
        unavailable: t('cluster.contentionLine.unavailable', { source: sourceLabel }),
      },
      footer: t('cluster.footer', { file: sourceFile }),
    },
    contention: {
      title: ({ n, cluster }) => t('contention.title', { n, cluster }),
      subtitle: t('contention.subtitle'),
      columns: {
        rank: t('contention.columns.rank'),
        vmName: t('contention.columns.vmName'),
        vcpu: t('contention.columns.vcpu'),
        readiness: t('contention.columns.readiness'),
        cluster: t('contention.columns.cluster'),
      },
      legendReference: t('contention.legendReference'),
      footer: t('contention.footer', { file: sourceFile }),
    },
  }
}
