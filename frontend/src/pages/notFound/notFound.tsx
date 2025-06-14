import React from 'react';
import { Link } from 'react-router-dom';
import styles from './notFound.module.css';
import { useTranslation } from 'react-i18next';

const NotFoundPage = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.notFound}>
      <h1>{t('404')}</h1>
      <p>{t('PageDoesntExist')}</p>
      <Link to="/">{t('ReturnHome')}</Link>
    </div>
  );
};

export default NotFoundPage;
