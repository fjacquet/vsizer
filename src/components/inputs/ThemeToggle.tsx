import { useTranslation } from 'react-i18next'
import { type ThemePreference, useTheme } from '../../hooks/useTheme'

const PREFERENCES: ReadonlyArray<ThemePreference> = ['auto', 'light', 'dark']

const Glyph = ({ pref }: { pref: ThemePreference }) => {
  switch (pref) {
    case 'light':
      // Sun
      return (
        <svg
          role="img"
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Light</title>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )
    case 'dark':
      // Moon
      return (
        <svg
          role="img"
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Dark</title>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )
    default:
      // Auto = monitor / half-tone
      return (
        <svg
          role="img"
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Auto</title>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      )
  }
}

/**
 * 3-state theme preference toggle (Auto / Light / Dark) — see ADR-0008.
 * Mirrors the language switcher's `<fieldset>` + `aria-pressed` idiom for
 * visual + a11y consistency.
 */
export function ThemeToggle() {
  const { t } = useTranslation('common')
  const { preference, setPreference } = useTheme()

  return (
    <fieldset
      aria-label={t('theme.label')}
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs dark:border-surface-700 dark:bg-surface-900"
    >
      <legend className="sr-only">{t('theme.label')}</legend>
      {PREFERENCES.map((pref) => {
        const active = preference === pref
        return (
          <button
            key={pref}
            type="button"
            onClick={() => setPreference(pref)}
            className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              active
                ? 'bg-primary-100 text-primary-900 dark:bg-primary-700 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            aria-pressed={active}
            aria-label={t(`theme.${pref}`)}
            title={t(`theme.${pref}`)}
          >
            <Glyph pref={pref} />
            <span>{t(`theme.${pref}`)}</span>
          </button>
        )
      })}
    </fieldset>
  )
}
