import { useTranslation } from 'react-i18next'
import type { SourceFile } from '../../types'

export interface SourceFileListProps {
  sources: SourceFile[]
}

const formatKb = (bytes: number): string => `${Math.round(bytes / 1024).toLocaleString()} kB`

/**
 * Chip list of imported source workbooks. Rendered under the dropzone
 * in the sidebar (ADR-0017).
 *
 * Zero sources: returns null (empty state — the dropzone is the
 * primary CTA).
 *
 * One source: a single panel with filename + size + source format,
 * matching the prior single-file UI closely.
 *
 * Multiple sources: a vertical list of chips, plus a one-line summary
 * (count + total row counts). No per-chip remove control in MVP — the
 * existing "Recommencer" reset clears everything.
 */
export function SourceFileList({ sources }: SourceFileListProps) {
  const { t } = useTranslation('upload')
  if (sources.length === 0) return null

  if (sources.length === 1) {
    const src = sources[0]
    if (!src) return null
    return (
      <div className="panel text-xs">
        <p className="mb-1 font-semibold uppercase tracking-wider text-accent-500">
          {t('fileLoaded.ariaLabel')}
        </p>
        <p className="break-all text-slate-700 dark:text-slate-200">{src.name}</p>
        <p className="text-slate-500">
          {formatKb(src.size)} · {t(`source.${src.source}`)} ·{' '}
          {t('sources.rowCounts', { vms: src.vinfoRows, hosts: src.vhostRows })}
        </p>
      </div>
    )
  }

  const totalVms = sources.reduce((acc, s) => acc + s.vinfoRows, 0)
  const totalHosts = sources.reduce((acc, s) => acc + s.vhostRows, 0)

  return (
    <div className="panel text-xs">
      <p className="mb-2 font-semibold uppercase tracking-wider text-accent-500">
        {t('sources.list.title')}
      </p>
      <p className="mb-2 text-slate-500">
        {t('sources.summary', { n: sources.length, vms: totalVms, hosts: totalHosts })}
      </p>
      <ul className="flex flex-col gap-1.5">
        {sources.map((src) => (
          <li
            key={`${src.name}:${src.size}`}
            className="flex items-baseline justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 dark:border-surface-700 dark:bg-surface-900"
          >
            <span className="break-all text-slate-700 dark:text-slate-200">{src.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
              {t(`source.${src.source}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
