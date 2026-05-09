import { useCallback, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface FileDropzoneProps {
  onFile(file: File): void
  /** When true, the dropzone is disabled (e.g., while a file is parsing). */
  disabled?: boolean
  /** Variant: full-page hero on the empty landing, compact in the sidebar. */
  variant?: 'hero' | 'compact'
}

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.csv', '.ods']
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',')

const isAcceptable = (file: File): boolean => {
  const lower = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Drag-and-drop zone with a click-to-browse fallback. Emits the chosen
 * `File` upward via `onFile`; parsing happens in `useDatasetUpload`.
 *
 * Privacy invariant (ADR-0001): the file never leaves this component
 * tree — it's read by `FileReader` in the upload hook and the bytes are
 * dropped after parsing. No fetches with the file body anywhere.
 */
export function FileDropzone({ onFile, disabled, variant = 'compact' }: FileDropzoneProps) {
  const { t } = useTranslation('upload')
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [isDragging, setIsDragging] = useState(false)

  const accept = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      if (!isAcceptable(file)) return
      onFile(file)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return
      accept(e.dataTransfer.files[0])
    },
    [accept, disabled],
  )

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      accept(e.target.files?.[0])
      // Reset so re-selecting the same file fires `onChange`.
      if (inputRef.current) inputRef.current.value = ''
    },
    [accept],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        inputRef.current?.click()
      }
    },
    [disabled],
  )

  const heroSize = variant === 'hero'
  const containerClasses = [
    'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors',
    heroSize ? 'p-12' : 'p-6',
    isDragging
      ? 'border-accent-500 bg-accent-500/10 dark:bg-primary-900/40'
      : 'border-slate-300 bg-white hover:border-primary-400 dark:border-surface-700 dark:bg-surface-800',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ].join(' ')

  return (
    <button
      type="button"
      className={`${containerClasses} w-full appearance-none`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      disabled={disabled}
      aria-label={t('dropzone.instruction')}
    >
      <p
        className={`font-semibold ${heroSize ? 'text-xl text-slate-900 dark:text-slate-100' : 'text-sm text-slate-700 dark:text-slate-200'}`}
      >
        {isDragging ? t('dropzone.active') : t('dropzone.instruction')}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('dropzone.or')} <span className="underline">{t('dropzone.browse')}</span>
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">{t('dropzone.accepted')}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={onChange}
        disabled={disabled}
      />
    </button>
  )
}
