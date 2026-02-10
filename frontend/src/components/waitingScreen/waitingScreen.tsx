import React from 'react';
import styles from './waitingScreen.module.css';
import { useTranslation } from 'react-i18next';
import BrandingImage from '../ReworkComponents/BrandingImage/BrandingImage';

const WaitingScreen = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.waitingScreen}>
      <BrandingImage
        imageKey="logo"
        alt={'Waiting illustration'}
        className={styles.waitingIllustration}
        fallbackSrc={`ochoIconFull.svg`}
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
