import React, { FC } from 'react';
import './Tag.css';

export interface TagProps {
  className?: string;
  style?: React.CSSProperties;
  bcolor?: string;
  tcolor?: string;
  tsize?: string;
  radius?: string;
  marginTop?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

const Tag: FC<TagProps> = ({
  className = '',
  style = {},
  bcolor = '',
  tcolor = 'white',
  tsize = '20px',
  // onClick,
  radius = '50px',
  marginTop = '15px',
  children,
}) => {

  // if bcolor is befine, he overwrite the class primary and secondary color
  // So if there isn't both we had by default the primary class
  if (!bcolor && !className.includes('primary') && !className.includes('secondary'))
    className += ' primary';

  return (
    <div
      className={className + " tagbase"}
      // onClick={onClick}
      style={{
        ...style,
        backgroundColor: bcolor,
        color: tcolor,
        fontSize: tsize,
        borderRadius: radius,
        marginTop: marginTop,
      }}
    >
      {children}
    </div>
  );
};

export default Tag;
