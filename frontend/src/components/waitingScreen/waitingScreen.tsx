import React from 'react';
import styles from './waitingScreen.module.css';

const WaitingScreen = () => {
  return (
    <div className={styles.waitingScreen}>
      <img
        src="/ochoIconFull.svg"
        alt="Waiting illustration"
        className={styles.waitingIllustration}
      />
      <p className={styles.waitingText}>
        Veuillez patienter
        <span className={styles.dot}>.</span>
        <span className={styles.dot}>.</span>
        <span className={styles.dot}>.</span>
      </p>
      <h2>La session commencera bientôt.</h2>
    </div>
  );
};

export default WaitingScreen;