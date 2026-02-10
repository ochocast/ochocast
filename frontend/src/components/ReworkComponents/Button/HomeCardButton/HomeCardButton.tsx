import React from 'react';
import styles from '../../generic/Button/Button.module.css';

export interface HomeCardButtonProps {
  Title: string;
  State?: ButtonState;
  onClickFunction?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
}

export enum ButtonState {
  active = 'active',
  disabled = 'disabled',
  colored = 'colored',
}

const HomeCardButton = (props: HomeCardButtonProps) => (
  <div>
    {props.State === ButtonState.disabled ? (
      <button
        className={styles.homeCardButton + ' ' + styles.disabled}
        style={{ cursor: 'not-allowed' }}
        disabled
      >
        {props.Title}
      </button>
    ) : (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (props.onClickFunction) {
            props.onClickFunction(e);
          }
        }}
        className={
          props.State === ButtonState.colored
            ? styles.homeCardButton + ' ' + styles.colored
            : styles.homeCardButton + ' ' + styles.active
        }
      >
        {props.Title}
      </button>
    )}
  </div>
);

export default HomeCardButton;
