import React, { FC } from 'react';
import './LoginPage.css';

import Header from '../../components/HeaderComponent/Header';
import LoginBox from './LoginBox/LoginBox'

interface LoginPageProps {}

const LoginPage: FC<LoginPageProps> = () => (
  <div className="LoginPage">
    <Header/>
    <LoginBox/>
  </div>
);
export default LoginPage;
