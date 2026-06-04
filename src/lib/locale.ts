import type { LocaleMode } from './contracts';

export type SupportedLocale = 'en' | 'zh-CN' | 'ja' | 'fr' | 'es' | 'ar' | 'ru' | 'el' | 'ko';

export function resolveSupportedLocale(localeMode: LocaleMode | SupportedLocale): SupportedLocale {
  if (
    localeMode === 'en' ||
    localeMode === 'zh-CN' ||
    localeMode === 'ja' ||
    localeMode === 'fr' ||
    localeMode === 'es' ||
    localeMode === 'ar' ||
    localeMode === 'ru' ||
    localeMode === 'el' ||
    localeMode === 'ko'
  ) {
    return localeMode;
  }

  const language = getBrowserUiLanguage();
  if (language.startsWith('zh')) return 'zh-CN';
  if (language.startsWith('ja')) return 'ja';
  if (language.startsWith('fr')) return 'fr';
  if (language.startsWith('es')) return 'es';
  if (language.startsWith('ar')) return 'ar';
  if (language.startsWith('ru')) return 'ru';
  if (language.startsWith('el')) return 'el';
  if (language.startsWith('ko')) return 'ko';
  return 'en';
}

function getBrowserUiLanguage(): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage().toLowerCase();
  }

  if (typeof navigator !== 'undefined') {
    return navigator.language.toLowerCase();
  }

  return 'en';
}
