import React, { FC, ChangeEvent } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const Toggle: FC<ToggleProps> = ({ onChange }) => {
  return (
    <div>
      <label className={styles.switch}>
        <input type="checkbox" onChange={onChange} />
        <span className={`${styles.slider} ${styles.round}`}></span>
      </label>
    </div>
  );
};

export default Toggle;
