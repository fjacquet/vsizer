import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enDashboard from './locales/en/dashboard.json'
import enPptx from './locales/en/pptx.json'
import enUpload from './locales/en/upload.json'
import enValidation from './locales/en/validation.json'
import frCommon from './locales/fr/common.json'
import frDashboard from './locales/fr/dashboard.json'
import frPptx from './locales/fr/pptx.json'
import frUpload from './locales/fr/upload.json'
import frValidation from './locales/fr/validation.json'

/**
 * Languages shipped at build-time. The detector falls back to `fallbackLng`
 * when the browser locale is something we don't yet translate.
 */
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Namespaces are split per UI concern so a translator can hand back one file
 * at a time without touching unrelated keys. Add a new namespace by listing
 * it here AND adding the matching JSON files under `locales/<lang>/`.
 */
export const NAMESPACES = ['common', 'upload', 'dashboard', 'pptx', 'validation'] as const
export const DEFAULT_NS = 'common' satisfies (typeof NAMESPACES)[number]

export const resources = {
  en: {
    common: enCommon,
    upload: enUpload,
    dashboard: enDashboard,
    pptx: enPptx,
    validation: enValidation,
  },
  fr: {
    common: frCommon,
    upload: frUpload,
    dashboard: frDashboard,
    pptx: frPptx,
    validation: frValidation,
  },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: DEFAULT_NS,
    ns: NAMESPACES,
    // React already escapes interpolated values; double-escaping mangles
    // characters like `&` and `<` in tooltip text.
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'vsizer-lang',
      caches: ['localStorage'],
    },
  })

export default i18n
