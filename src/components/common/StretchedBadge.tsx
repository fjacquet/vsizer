import { useTranslation } from 'react-i18next'

export interface StretchedBadgeProps {
  /** Tailwind class hook, mostly for layout (margins). */
  className?: string
}

/**
 * Inline gold pill that flags a 2-site stretched vSAN/vSphere cluster
 * carrying a 50 % DR reservation (ADR-0007). Hover-tooltip explains the
 * 50 %-CPU+RAM rule without requiring extra docs.
 */
export function StretchedBadge({ className }: StretchedBadgeProps) {
  const { t } = useTranslation('common')
  return (
    <span
      title={t('badge.stretchedFull')}
      className={`inline-flex items-center rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-900 ${className ?? ''}`}
    >
      {t('badge.stretched')}
    </span>
  )
}
