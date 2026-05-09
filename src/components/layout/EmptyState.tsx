import { useTranslation } from 'react-i18next'
import { useDatasetUpload } from '../../hooks/useDatasetUpload'
import { FileDropzone } from '../inputs/FileDropzone'

/**
 * Empty landing state: brand wordmark + hero dropzone + "Charger un exemple"
 * button. The whole viewport invites the drop (ADR-0006).
 *
 * The sample button calls `fetch('samples/rvtools-sample.xlsx')` (relative
 * to the deployed base path). When the sample isn't present yet it logs a
 * silent failure and the dropzone remains the only path forward — which is
 * exactly what we want today since the anonymized sample isn't shipped.
 */
export function EmptyState() {
  const { t } = useTranslation('common')
  const { uploadFile, isUploading } = useDatasetUpload()

  const loadSample = async () => {
    try {
      const url = `${import.meta.env.BASE_URL}samples/rvtools-sample.xlsx`
      const res = await fetch(url)
      if (!res.ok) return
      const blob = await res.blob()
      const file = new File([blob], 'rvtools-sample.xlsx', { type: blob.type })
      await uploadFile(file)
    } catch {
      // Silent: the dropzone is always available as the fallback.
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">{t('appName')}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t('tagline')}</p>
        </div>
        <FileDropzone
          onFile={(f) => {
            void uploadFile(f)
          }}
          disabled={isUploading}
          variant="hero"
        />
        <button
          type="button"
          onClick={() => {
            void loadSample()
          }}
          disabled={isUploading}
          className="text-sm text-slate-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-400"
        >
          {t('actions.loadSample')}
        </button>
        <p className="text-xs text-slate-500">{t('footer')}</p>
      </div>
    </div>
  )
}
