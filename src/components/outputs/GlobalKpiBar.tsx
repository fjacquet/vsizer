import { useTranslation } from 'react-i18next'
import { THEME } from '../../engines/export/pptx/theme'
import type { GlobalSummary } from '../../types'
import { fmtGhzValue, fmtInt, fmtPercentWhole } from '../../utils/format'
import { KpiCard } from '../common/KpiCard'

export interface GlobalKpiBarProps {
  globals: GlobalSummary
}

/**
 * Top-of-page bandeau showing four estate-wide KPIs. Same fields as the
 * PPTX title slide's bottom tiles so the dashboard's first viewport mirrors
 * the deck's first slide (ADR-0006).
 */
export function GlobalKpiBar({ globals }: GlobalKpiBarProps) {
  const { t } = useTranslation('dashboard')
  return (
    <section aria-labelledby="global-kpi-heading" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <h2 id="global-kpi-heading" className="sr-only">
        {t('globalKpi.hosts')}
      </h2>
      <KpiCard accent={THEME.navy} big={fmtInt(globals.hostCount)} small={t('globalKpi.hosts')} />
      <KpiCard accent={THEME.navy} big={fmtInt(globals.vmCount)} small={t('globalKpi.vms')} />
      <KpiCard
        accent={THEME.gold}
        big={fmtGhzValue(globals.physicalGhz)}
        small={t('globalKpi.physicalGhz')}
      />
      <KpiCard
        accent={THEME.gold}
        big={fmtPercentWhole(globals.meanCpuRatio)}
        small={t('globalKpi.meanCpu')}
      />
    </section>
  )
}
