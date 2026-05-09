import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'
import { Cockpit } from './components/layout/Cockpit'
import { EmptyState } from './components/layout/EmptyState'
import { Header } from './components/layout/Header'
import { selectHasDataset, useDatasetStore } from './store/datasetStore'

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
  const { t } = useTranslation('common')
  const hasDataset = useDatasetStore(selectHasDataset)

  return (
    <ErrorBoundary FallbackComponent={FallbackError}>
      <div className="flex min-h-screen flex-col">
        {hasDataset ? <Header /> : null}
        {hasDataset ? <Cockpit /> : <EmptyState />}
        {hasDataset ? (
          <footer className="border-t border-surface-700 px-6 py-2 text-center text-xs text-slate-500">
            {t('footer')}
          </footer>
        ) : null}
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </ErrorBoundary>
  )
}

export default App
