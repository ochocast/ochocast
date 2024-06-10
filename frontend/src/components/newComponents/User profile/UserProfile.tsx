import React, { FC } from 'react';

import './UserProfile.css';
import Card from '../Card/Card';
import ProfilePic from './Ellipse 2.png';

interface UserProfileProps {
  className?: string;
  style?: React.CSSProperties;
  tcolor?: string;
  tsize?: string;
  height?: string;
  width?: string;
}

const UserProfile: FC<UserProfileProps> = ({
  style,
  tcolor = 'black',
  tsize = '1em',
}) => {
  return (
    <Card style={{ flexDirection: 'column' }}>
      <div /* radius 50 et image carrée capé la hauteur a 3/4 de la card*/
      style={{
        ...style,
        color: tcolor,
        fontSize: tsize,
      }}></div>
      <img className="ProfilePic"
        src={ProfilePic}
        alt="ProfilePic"
      />
      <h1
        style={{
          ...style,
          color: tcolor,
          fontSize: tsize,
          textAlign: 'center'
        }} > 
      Nom Prenom 
      </h1>
      <h2 
        style={{
          ...style,
          color: tcolor,
          fontSize: tsize,
          textAlign: 'center'
        }}
      > Email: nom.prenom@mail.com
      </h2>
    </Card>
  );
};

export default UserProfile;