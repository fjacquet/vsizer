import { useTranslation } from 'react-i18next'
import type { PptxStrings } from '../engines/export/pptx/builder'

/**
 * Assemble a `PptxStrings` bag from i18next translations. Keeps the
 * builder pure (engine, no React) while letting the slide layout strings
 * live in JSON files reviewable by translators.
 *
 * Function-typed slots (subtitles) are wrappers around `t(..., vars)` so
 * the i18next interpolation runs at slide-build time with the actual
 * per-cluster numbers.
 */
export function usePptxStrings(sourceFile: string, dateIso: string): PptxStrings {
  const { t } = useTranslation('pptx')

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
        totalMemFormatted,
      }) =>
        t('cluster.subtitle', {
          hosts: hostCount,
          vms: vmCount,
          cores: totalCoresFormatted,
          ghzPerCore: ghzPerCoreFormatted,
          ram: totalMemFormatted,
        }),
      cards: {
        cpuMean: t('cluster.cards.cpuMean'),
        ramMean: t('cluster.cards.ramMean'),
        ghzUsedVsPhys: t('cluster.cards.ghzUsedVsPhys'),
        mhzPerVcpu: t('cluster.cards.mhzPerVcpu'),
      },
      blocks: {
        cpuTitle: t('cluster.blocks.cpuTitle'),
        ramTitle: t('cluster.blocks.ramTitle'),
        cpuSubtitle: (consumed, physical) =>
          t('cluster.blocks.cpuSubtitle', { consumed, physical }),
        ramSubtitle: (consumed, total) => t('cluster.blocks.ramSubtitle', { consumed, total }),
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
      footer: t('cluster.footer', { file: sourceFile }),
    },
  }
}
