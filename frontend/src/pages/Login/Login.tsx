import React, { FC } from 'react';
import './Login.css';

import LoginBox from '../../components/LoginBox/LoginBox'

interface LoginProps {}

const LoginPage: FC<LoginProps> = () => (
  <div className="Login">
    <LoginBox/>
  </div>
);
export default LoginPage;
