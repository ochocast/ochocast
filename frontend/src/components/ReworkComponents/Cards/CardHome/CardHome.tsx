import React from 'react';
import styles from './CardHome.module.css';
import HomeCardButton, {
  ButtonState,
} from '../../Button/HomeCardButton/HomeCardButton';
import Card from '../Card';

type CardHomeProps = {
  Title: string;
  Description: string;
  ButtonState?: ButtonState;
  buttonList?: {
    title: string;
    onClickFunction: (
      e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    ) => void;
  }[];
};

const CardHome = (props: CardHomeProps) => {
  return (
    <Card>
      <div className={styles.container}>
        <div className={styles.streamingParent}>
          <h1 className={styles.title}>{props.Title}</h1>
        </div>
        <div className={styles.homeCardsChild}></div>
        <div className={styles.theContentLorem}>
          <p>{props.Description}</p>
        </div>
        <div className={styles.buttonList}>
          {props.buttonList &&
            props.buttonList.map((button, index) => (
              <HomeCardButton
                key={index}
                Title={button.title}
                onClickFunction={(e) => {
                  e.stopPropagation();
                  button.onClickFunction(e);
                }}
                State={props.ButtonState}
              />
            ))}
        </div>
      </div>
    </Card>
  );
};

export default CardHome;
