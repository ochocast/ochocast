import React, { FC } from 'react';
import styles from './HomeCardButton.module.css';

export interface HomeCardButtonProps {
  Title: string;
  State?: ButtonState;
  onClickFunction?: () => void;
}

export enum ButtonState {
  active = 'active',
  disabled = 'disabled',
  colored = 'colored',
}

const HomeCardButton: FC<HomeCardButtonProps> = (props) => (
  <div>
    {props.State === ButtonState.disabled ? (
      <button
        className={styles.homeCardButton + ' ' + styles.disabled}
        disabled
      >
        {props.Title}
      </button>
    ) : (
      <button
        onClick={props.onClickFunction}
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
