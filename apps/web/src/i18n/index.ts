import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { es } from './es';

export const languages = ['es', 'en'] as const;
export type Language = (typeof languages)[number];

const STORAGE_KEY = 'vidopdf.language';

function isLanguage(value: unknown): value is Language {
  return languages.some((language) => language === value);
}

/** Spanish is the default; only an explicit choice by the user changes it. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : 'es';
  } catch {
    return 'es';
  }
}

export function setLanguage(language: Language): void {
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage can be blocked (private mode); the choice still applies for this session.
  }
  void i18next.changeLanguage(language);
}

export async function initI18n(): Promise<void> {
  const lng = initialLanguage();
  document.documentElement.lang = lng;
  await i18next.use(initReactI18next).init({
    lng,
    fallbackLng: 'es',
    resources: { es: { translation: es }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

export { i18next };
