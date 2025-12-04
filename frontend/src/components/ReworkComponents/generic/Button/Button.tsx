import React from 'react';
import styles from './Button.module.css';

export interface HomeCardButtonProps {
  label: string;
  type?: ButtonType;
  onClick?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export enum ButtonType {
  primary = 'primary',
  secondary = 'secondary',
  disabled = 'disabled',
  danger = 'danger',
}

const Button = (props: HomeCardButtonProps) => {
  const getButtonClass = () => {
    if (props.type === ButtonType.primary) return styles.primary;
    if (props.type === ButtonType.danger) return styles.danger;
    return styles.secondary;
  };

  return (
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
            if (props.onClick) {
              props.onClick(e);
            }
          }}
          className={`${styles.homeCardButton} ${getButtonClass()}`}
        >
          {props.label}
        </button>
      )}
    </div>
  );
};

export default Button;
