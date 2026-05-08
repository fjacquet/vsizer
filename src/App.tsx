import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

/**
 * Top-level fallback shown when any child of `<ErrorBoundary>` throws.
 * Exported so it can be unit-tested in isolation; `react-error-boundary`
 * types `error` as `unknown`, so we narrow before printing.
 */
export function FallbackError({ error }: FallbackProps) {
  const { t } = useTranslation('common')
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="m-8 rounded-lg border border-util-high/40 bg-surface-800 p-6">
      <h2 className="mb-2 text-lg font-semibold text-util-high">{t('error.title')}</h2>
      <pre className="overflow-auto whitespace-pre-wrap text-sm text-slate-300">{message}</pre>
    </div>
  )
}

function App() {
  const { t } = useTranslation(['common', 'upload'])
  return (
    <ErrorBoundary FallbackComponent={FallbackError}>
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-surface-700 bg-surface-800 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-100">{t('common:appName')}</h1>
              <p className="text-xs text-slate-400">{t('common:tagline')}</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">
          <p className="text-slate-400">{t('upload:dropzone.instruction')}</p>
        </main>
        <footer className="border-t border-surface-700 px-6 py-2 text-xs text-slate-500">
          {t('common:footer')}
        </footer>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </ErrorBoundary>
  )
}

export default App
