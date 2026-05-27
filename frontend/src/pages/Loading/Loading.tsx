import React from 'react';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import styles from './LoadingPage.module.css';

function LoadingPage() {
  return (
    <div className={styles.loadingPage}>
      <LoadingCircle />
    </div>
  );
}

export default LoadingPage;
