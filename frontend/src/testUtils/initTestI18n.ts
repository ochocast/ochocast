import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr/translation.json';

/**
 * i18next setup for tests: `src/i18n.ts` relies on webpack's
 * `require.context` and cannot be imported by Jest. Importing this module
 * makes `useTranslation` return the real French strings.
 */
i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
