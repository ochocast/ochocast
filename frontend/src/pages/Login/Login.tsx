import React, { FC } from 'react';
import styles from './Login.module.css';

import LoginBox from '../../components/LoginBox/LoginBox';

export interface LoginProps {}

const LoginPage: FC<LoginProps> = () => (
  <div className={styles.Login}>
    <LoginBox />
  </div>
);
export default LoginPage;
