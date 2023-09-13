import React, { FC } from 'react';
import './Login.css';

import Header from '../../components/Header/Header';
import LoginBox from '../../components/LoginBox/LoginBox'

interface LoginProps {}

const LoginPage: FC<LoginProps> = () => (
  <div className="Login">
    <Header/>
    <LoginBox/>
  </div>
);
export default LoginPage;
