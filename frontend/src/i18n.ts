import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

interface WebpackRequire extends NodeRequire {
  context: (
    path: string,
    deep?: boolean,
    filter?: RegExp,
  ) => {
    keys: () => string[];
    (key: string): string;
  };
}
declare const require: WebpackRequire;

const context = require.context('./locales', true, /translation\.json$/);

const resources: Record<string, { translation: string }> = {};
context.keys().forEach((key: string) => {
  const lang = key.split('/')[1]; // ex: './fr/translation.json' => 'fr'
  resources[lang] = { translation: context(key) };
});

const savedLang = localStorage.getItem('lang');

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang || undefined,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
