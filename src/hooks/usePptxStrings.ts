import { useTranslation } from 'react-i18next'
import type { PptxStrings } from '../engines/export/pptx/builder'
import type { SourceFormat } from '../engines/parser/detectSource'
import { buildPptxStrings } from '../engines/export/pptx/strings'

export function usePptxStrings(sourceFile: string, dateIso: string, sourceFormat: SourceFormat): PptxStrings {
  const { t } = useTranslation('pptx')
  return buildPptxStrings(t, sourceFile, dateIso, sourceFormat)
}
