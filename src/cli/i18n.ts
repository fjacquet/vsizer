import i18next, { type TFunction } from 'i18next'
import { resources } from '../i18n'

/** A React-free i18next instance bound to the 'pptx' namespace, for the CLI. */
export function createPptxT(lng: string): TFunction {
  const instance = i18next.createInstance()
  instance.init({
    resources,
    lng,
    fallbackLng: 'fr',
    ns: ['pptx'],
    defaultNS: 'pptx',
    initImmediate: false,
  })
  return instance.getFixedT(lng, 'pptx')
}
