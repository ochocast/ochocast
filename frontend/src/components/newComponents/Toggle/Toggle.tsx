import React, { FC, ChangeEvent } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  checked?: boolean;
  label?: string;
  disabled?: boolean;
  id?: string;
}

const Toggle: FC<ToggleProps> = ({
  onChange,
  checked,
  label,
  disabled = false,
  id,
}) => {
  return (
    <div className={styles.toggleContainer}>
      <label className={`${styles.switch} ${disabled ? styles.disabled : ''}`}>
        <input
          type="checkbox"
          onChange={onChange}
          checked={checked}
          disabled={disabled}
          id={id}
        />
        <span className={`${styles.slider} ${styles.round}`}></span>
      </label>
      {label && (
        <span
          className={`${styles.label} ${disabled ? styles.labelDisabled : ''}`}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default Toggle;
