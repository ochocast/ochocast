import React from 'react';
import styles from './Button.module.css';

export interface HomeCardButtonProps {
  label: string;
  type?: ButtonType;
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
}

export enum ButtonType {
  primary = 'primary',
  secondary = 'secondary',
  disabled = 'disabled',
}

const Button = (props: HomeCardButtonProps) => (
  <div>
    {props.type === ButtonType.disabled ? (
      <button
        className={`${styles.homeCardButton} ${styles.disabled}`}
        style={{ cursor: 'not-allowed' }}
        disabled
      >
        {props.label}
      </button>
    ) : (
      <button
        onClick={(e) => {
          e.stopPropagation();
          console.log('click');
          if (props.onClick) {
            props.onClick(e);
          }
        }}
        className={`${styles.homeCardButton} ${props.type === ButtonType.primary ? styles.primary : styles.secondary}`}>
        {props.label}
      </button>
    )}
  </div>
);

export default Button;
