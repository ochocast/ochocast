import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitcher.module.css';

interface WebpackRequire extends NodeRequire {
  context: (
    path: string,
    deep?: boolean,
    filter?: RegExp,
  ) => {
    keys: () => string[];
  };
}
declare const require: WebpackRequire;

type LanguageOption = {
  code: string;
  label: string;
};

const context = require.context('../../locales', true, /translation\.json$/);
const languageCodes = Array.from(
  new Set(context.keys().map((key) => key.split('/')[1])),
);

const LANGUAGES: LanguageOption[] = languageCodes.map((code) => ({
  code,
  label: code.toUpperCase(),
}));

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const currentLang = i18n.language;

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
    setOpen(false);
  };

  return (
    <div className={styles.selector}>
      <button className={styles.button} onClick={() => setOpen(!open)}>
        🌐 {LANGUAGES.find((l) => l.code === currentLang)?.label || 'Language'}{' '}
        ▾
      </button>

      {open && (
        <ul className={styles.dropdown}>
          {LANGUAGES.map((lang) => (
            <li
              key={lang.code}
              className={`${styles.item} ${
                currentLang === lang.code ? 'active' : ''
              }`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              {lang.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LanguageSelector;
