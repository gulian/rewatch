// i18n setup: browser language before login (fr if available, en otherwise),
// then the account language (me.language) takes over once known.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './fr.json'
import en from './en.json'

export type Lang = 'fr' | 'en'

export const browserLang = (): Lang => (navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en')

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: browserLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
