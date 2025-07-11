import React, { useState, useEffect } from 'react';
import FrFlag from '@site/static/img/fr-flag.svg';
import EnFlag from '@site/static/img/en-flag.svg';
import styles from './LanguageSwitcher.module.css';

const getLangFromCookie = () => {
    if (typeof document === 'undefined') return 'fr';
    const cookie = document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('googtrans='));
    if (cookie) {
        const lang = cookie.split('/')[2];
        return lang === 'en' ? 'en' : 'fr';
    }
    return 'fr';
};

const LanguageSwitcher: React.FC = () => {
    const [lang, setLang] = useState<'fr' | 'en'>(getLangFromCookie());

    useEffect(() => {
        setLang(getLangFromCookie());
    }, []);

    const handleLanguageChange = () => {
        const newLang = lang === 'fr' ? 'en' : 'fr';
        document.cookie = `googtrans=/fr/${newLang};path=/`;
        window.location.reload();
    };

    const Flag = lang === 'en' ? FrFlag : EnFlag;
    const title = lang === 'en' ? 'Passer au Français' : 'Switch to English';

    return (
        <div className={styles.languageSwitcherContainer}>
            <div id="google_translate_element" style={{ display: 'none' }}></div>
            <button
                type="button"
                onClick={handleLanguageChange}
                className={styles.flagButton}
                title={title}
                aria-label={title}>
                <Flag className={styles.flagIcon} />
            </button>
        </div>
    );
};

export default LanguageSwitcher;
