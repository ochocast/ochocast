import React from 'react';
import styles from './CardTextList.module.css';
import Card from '../Card';

type CardTextListProps = {
  title: string;
  user: string[];
};

const CardTextList = (props: CardTextListProps) => {
  return (
    <Card>
      <h4 className={styles.Title}>{props.title}</h4>
      <ul className={styles.persons}>
        {props.user.map((user, index) => (
          <li key={index}>{user}</li>
        ))}
      </ul>
    </Card>
  );
};

export default CardTextList;
