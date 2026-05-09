import { useTranslation } from 'react-i18next'
import { useExport } from '../../hooks/useExport'
import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n'
import { useDatasetStore } from '../../store/datasetStore'
import { ThemeToggle } from '../inputs/ThemeToggle'

const switchLanguage = (lang: SupportedLanguage): void => {
  void i18n.changeLanguage(lang)
}

/**
 * Sticky top bar. Brand left, language + theme toggles + Export PPTX
 * button right. "Recommencer" returns the user to the empty landing state
 * by clearing the store (ADR-0006). Theme follows OS by default and can
 * be overridden via the segmented control (ADR-0008).
 */
export function Header() {
  const { t, i18n: i18nApi } = useTranslation('common')
  const reset = useDatasetStore((s) => s.reset)
  const hasFile = useDatasetStore((s) => s.file !== null)
  const { canExport, isExporting, exportPptx } = useExport()
  const currentLang = i18nApi.resolvedLanguage as SupportedLanguage | undefined

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-surface-700 dark:bg-surface-800/95">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-6 py-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('appName')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('tagline')}</p>
        </div>
        <div className="flex items-center gap-3">
          <fieldset
            aria-label={t('lang.label')}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs dark:border-surface-700 dark:bg-surface-900"
          >
            <legend className="sr-only">{t('lang.label')}</legend>
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = currentLang === lang
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => switchLanguage(lang)}
                  className={`rounded px-2 py-1 transition-colors ${
                    active
                      ? 'bg-primary-100 text-primary-900 dark:bg-primary-700 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                  aria-pressed={active}
                >
                  {t(`lang.${lang}`)}
                </button>
              )
            })}
          </fieldset>
          <ThemeToggle />
          {hasFile ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              {t('actions.reset')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void exportPptx()
            }}
            disabled={!canExport || isExporting}
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-primary-900 transition-colors hover:bg-accent-500/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-surface-700 dark:disabled:text-slate-500"
          >
            {t('actions.exportPptx')}
          </button>
        </div>
      </div>
    </header>
  )
}
