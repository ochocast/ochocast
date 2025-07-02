import React from 'react';
import styles from './CardHome.module.css';
import Button, { ButtonType } from '../../Button/Button';
import Card from '../Card';

type CardHomeProps = {
  title: string;
  description: string;
  buttonState?: ButtonType;
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
          <h1 className={styles.title}>{props.title}</h1>
        </div>
        <div className={styles.homeCardsChild}></div>
        <div className={styles.theContentLorem}>
          <p>{props.description}</p>
        </div>
        <div className={styles.buttonList}>
          {props.buttonList &&
            props.buttonList.map((button, index) => (
              <Button
                key={index}
                label={button.title}
                onClick={(e) => {
                  e.stopPropagation();
                  button.onClickFunction(e);
                }}
                type={props.buttonState}
              />
            ))}
        </div>
      </div>
    </Card>
  );
};

export default CardHome;
