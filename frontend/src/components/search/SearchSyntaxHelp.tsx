import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SearchSyntaxHelp.module.css';

/** One line of the help: an example query and what it finds. */
interface SyntaxExample {
  query: string;
  labelKey:
    | 'searchSyntax.allWords'
    | 'searchSyntax.phrase'
    | 'searchSyntax.either'
    | 'searchSyntax.exclude';
}

// The syntax `GET /api/search` understands (backend/src/search/README.md).
const EXAMPLES: SyntaxExample[] = [
  { query: 'kubernetes sauvegarde', labelKey: 'searchSyntax.allWords' },
  { query: '"données personnelles"', labelKey: 'searchSyntax.phrase' },
  { query: 'ffmpeg or rgpd', labelKey: 'searchSyntax.either' },
  { query: 'kubernetes -docker', labelKey: 'searchSyntax.exclude' },
];

export interface SearchSyntaxHelpProps {
  /** Runs an example query, as if it had been typed. */
  onTryExample: (query: string) => void;
}

/**
 * "?" button of the search bar, with its tooltip, opening a panel that
 * explains the advanced search syntax. Each example can be tried in one click.
 */
const SearchSyntaxHelp = ({ onTryExample }: SearchSyntaxHelpProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const tryExample = (query: string) => {
    setOpen(false);
    onTryExample(query);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.helpButton}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('searchSyntax.button')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-tooltip={t('searchSyntax.tooltip')}
      >
        ?
      </button>

      {open && (
        <div
          id={panelId}
          className={styles.panel}
          role="dialog"
          aria-labelledby={titleId}
          // The search bar focuses its input on any click inside it.
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.panelHeader}>
            <h2 id={titleId} className={styles.title}>
              {t('searchSyntax.title')}
            </h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setOpen(false)}
              aria-label={t('searchSyntax.close')}
            >
              ×
            </button>
          </div>

          <p className={styles.intro}>{t('searchSyntax.intro')}</p>

          <ul className={styles.examples}>
            {EXAMPLES.map(({ query, labelKey }) => (
              <li key={query} className={styles.example}>
                <button
                  type="button"
                  className={styles.exampleQuery}
                  onClick={() => tryExample(query)}
                  title={t('searchSyntax.try')}
                >
                  <code>{query}</code>
                </button>
                <span className={styles.exampleLabel}>{t(labelKey)}</span>
              </li>
            ))}
          </ul>

          <ul className={styles.notes}>
            <li>{t('searchSyntax.noteForms')}</li>
            <li>{t('searchSyntax.noteOrder')}</li>
            <li>{t('searchSyntax.noteTypos')}</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchSyntaxHelp;
