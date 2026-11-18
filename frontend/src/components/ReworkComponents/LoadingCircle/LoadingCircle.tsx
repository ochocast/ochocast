import React from 'react';
import styles from './LoadingCircle.module.css';

const LoadingCircle = ({ compact = false }: { compact?: boolean }) => {
  return (
    <div>
      <div
        className={`${styles.loaderContainer} ${compact ? styles.compact : ''}`}
      >
        <div className={styles.loader}></div>
      </div>
    </div>
  );
};

export default LoadingCircle;
