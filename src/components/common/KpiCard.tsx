import type { CSSProperties, ReactNode } from 'react'

export interface KpiCardProps {
  /** The headline value. Pre-formatted string from `@utils/format`. */
  big: ReactNode
  /** The subordinate label. */
  small: ReactNode
  /** Hex color (no `#`) used for the left rail and the headline text. */
  accent: string
  /** Tailwind class hook to override the default card padding/density. */
  className?: string
}

/**
 * Compact KPI tile used on the global bar and on cluster cards. Visually
 * mirrors `drawKpiCard` from the PPTX builder so the on-screen and on-slide
 * tiles look like siblings (ADR-0006).
 */
export function KpiCard({ big, small, accent, className }: KpiCardProps) {
  const style: CSSProperties = { borderColor: `#${accent}` }
  return (
    <div
      className={`relative overflow-hidden rounded-lg border-l-4 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-surface-800 dark:shadow-none dark:ring-0 ${className ?? ''}`}
      style={style}
    >
      <div className="text-2xl font-semibold leading-tight" style={{ color: `#${accent}` }}>
        {big}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{small}</div>
    </div>
  )
}
