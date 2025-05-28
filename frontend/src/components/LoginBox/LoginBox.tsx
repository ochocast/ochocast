import { FC } from 'react';
import { useAuth } from 'react-oidc-context';
import React from 'react';
import { useTranslation } from 'react-i18next';

import './LoginBox.css';

import octoLogo from '../../assets/octoBichrome.png';

interface LoginBoxProps {}

const LoginBox: FC<LoginBoxProps> = () => {
  // Authentication from oidc
  const auth = useAuth();
  const { t } = useTranslation();

  return (
    <div className="LoginBox">
      <img className="Bichrome" src={octoLogo} alt="BichromeLogo"></img>
      <h1>{t('LogIn')}</h1>
      <hr />
      <button className="btn" onClick={() => auth.signinRedirect()}>
        {t('ContinueWithKeycloak')}
      </button>
    </div>
  );
};

export default LoginBox;
