import React from 'react';
import styles from './waitingScreen.module.css';
import { useTranslation } from 'react-i18next';

const WaitingScreen = () => {

  const { t } = useTranslation();

  return (
    <div className={styles.waitingScreen}>
      <img
        src="/ochoIconFull.svg"
        alt="Waiting illustration"
        className={styles.waitingIllustration}
      />
      <p className={styles.waitingText}>
        {t('Please wait')}
        <span className={styles.dot}>.</span>
        <span className={styles.dot}>.</span>
        <span className={styles.dot}>.</span>
      </p>
      <h2>{t('TheSessionWillStartSoon')}</h2>
    </div>
  );
};

export default WaitingScreen;