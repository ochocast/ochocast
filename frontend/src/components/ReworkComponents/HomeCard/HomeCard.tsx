import React from 'react';
import styles from './HomeCards.module.css';
import HomeCardButton, {
  ButtonState,
} from '../Button/HomeCardButton/HomeCardButton';

type HomeCardsProps = {
  Title: string;
  Description: string;
  ButtonTitle: string;
  ButtonState?: ButtonState;
  onClickFunction?: () => void;
};

const HomeCards = (props: HomeCardsProps) => {
  return (
    <div className={styles.homeCards}>
      <div className={styles.streamingParent}>
        <h1 className={styles.streaming}>{props.Title}</h1>
        <HomeCardButton
          Title={props.ButtonTitle}
          State={props.ButtonState}
          onClickFunction={props.onClickFunction}
        />
      </div>
      <div className={styles.homeCardsChild}></div>
      <div className={styles.theContentLorem}>
        <p>{props.Description}</p>
      </div>
    </div>
  );
};

export default HomeCards;
