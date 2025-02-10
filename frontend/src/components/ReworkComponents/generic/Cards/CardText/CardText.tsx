import React from 'react';
import styles from './CardText.module.css';
import Card from '../Card';

type CardTextProps = {
  text: string;
};

const CardText = (props: CardTextProps) => {
  return (
    <Card>
      <div className={styles.CardText}>{props.text}</div>
    </Card>
  );
};

export default CardText;
