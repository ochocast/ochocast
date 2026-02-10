import React, { CSSProperties } from 'react';
import styles from './Card.module.css';

type CardProps = {
  children?: React.ReactNode;
  styleAddon?: CSSProperties;
};

const Card = ({ children, styleAddon }: CardProps) => {
  return (
    <div className={styles.Cards} style={styleAddon}>
      {children}
    </div>
  );
};

export default Card;
