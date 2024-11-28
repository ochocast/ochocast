import React from 'react';
import styles from './CardHome.module.css';
import HomeCardButton, {
  ButtonState,
} from '../../Button/HomeCardButton/HomeCardButton';
import Card from '../Card';

type CardHomeProps = {
  Title: string;
  Description: string;
  ButtonTitle: string;
  ButtonState?: ButtonState;
  onClickFunction?: () => void;
};

const CardHome = (props: CardHomeProps) => {
  return (
    <Card>
      <div className={styles.container}>
        <div className={styles.streamingParent}>
          <h1 className={styles.title}>{props.Title}</h1>
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
    </Card>
  );
};

export default CardHome;
