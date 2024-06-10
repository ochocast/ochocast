import React, { FC } from 'react';

import './Card.css';

interface CardProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  border?: string;
  bradius?: string;
  bcolor?: string;
  tcolor?: string;
  tsize?: string;
}

const Card: FC<CardProps> = ({
  className = "",
  style,
  children,
  border = '5px solid',
  bradius = '10px',
  bcolor = 'white',
  tcolor = 'black',
  tsize = '1em',
}) => {
  return (
    <div className={className + " card"}
      style={{
        ...style,
        backgroundColor: bcolor,
        color: tcolor,
        fontSize: tsize,
        border,
        borderRadius: bradius,
      }}>
      {children}
    </div>
  );
};

export default Card;