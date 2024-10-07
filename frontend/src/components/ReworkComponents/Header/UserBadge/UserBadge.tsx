import React from 'react';
import profilePicture from './profile-picture.svg';
import './UserBadge.css';

interface Props {
  username?: string;
  image?: string;
}

export const UserBadge = ({ username, image }: Props): JSX.Element => {
  return (
    <div className="userBadge">
      <div className="userBadge-name">{username}</div>
      <img
        className="userBadge-picture"
        alt="Profile picture"
        src={image ? image : profilePicture}
      />
    </div>
  );
};
