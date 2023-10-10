import { FC } from 'react';
import {useAuth} from 'react-oidc-context'

import './LoginBox.css';

import octoLogo from "../../assets/octoBichrome.png"

interface LoginBoxProps {}


const LoginBox: FC<LoginBoxProps> = () => {
  // Authentication from oidc
  const auth = useAuth()

  return (
    <div className="LoginBox">
      <img className="Bichrome" src={octoLogo} alt="BichromeLogo"></img>
      <h1>Se connecter</h1>
      <hr/>
      <button className="btn" onClick={() => auth.signinRedirect()}>Continuer avec Keycloak</button>
    </div>
)};

export default LoginBox;
