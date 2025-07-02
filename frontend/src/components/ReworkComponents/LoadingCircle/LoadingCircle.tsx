import React from 'react';
import styles from './LoadingCircle.module.css';

const LoadingCircle = () => {
  return (
    <div>
      <div className={styles.loaderContainer}>
        <div className={styles.loader}></div>
      </div>
    </div>
  );
};

export default LoadingCircle;
