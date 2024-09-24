import React, { FC } from 'react';
import './HeaderUserButton.css';

import userIcon from '../../../../assets/UserIcon.png';

export interface HeaderUserButtonProps {
  username: string;
}

const HeaderUserButton: FC<HeaderUserButtonProps> = (props) => (
  <div className="HeaderUserButton">
    <span className="TextBox">{props.username}</span>
    <img className="IconLogo" src={userIcon} alt="IconLogo"></img>
  </div>
);

export default HeaderUserButton;
