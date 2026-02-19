import { createI18n } from 'vue-i18n'
import en from './locales/en'
import ru from './locales/ru'

export const LOCALE_STORAGE_KEY = 'app-locale'

export const SUPPORTED_LOCALES = ['en', 'ru'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

function getSavedLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) {
      return saved as SupportedLocale
    }
  } catch {
    // ignore
  }
  return 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    ru,
  },
})

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // ignore
  }
}

export default i18n
