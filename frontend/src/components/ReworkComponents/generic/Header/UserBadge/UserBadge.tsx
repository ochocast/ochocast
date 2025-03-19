import React, { JSX } from 'react';
import profilePicture from './profile-picture.svg';
import { useNavigate } from 'react-router-dom';
import './UserBadge.css';

interface Props {
  username?: string;
  image?: string;
}

export const UserBadge = ({ username, image }: Props): JSX.Element => {
  // navigate to user profile
  const navigate = useNavigate();

  return (
    <div
      className="userBadge"
      onClick={() => {
        navigate('/profile');
      }}
    >
      <div className="userBadge-name">{username}</div>
      <img
        className="userBadge-picture"
        alt="Profile picture"
        src={image ? image : profilePicture}
      />
    </div>
  );
};
