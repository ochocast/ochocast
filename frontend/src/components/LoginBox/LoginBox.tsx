import { FC } from 'react';
import { ChangeEvent, FormEvent, useState } from 'react'
import {useAuth} from 'react-oidc-context'

import './LoginBox.css';

import TextBox from '../../components/TextBox/TextBox'

import octoLogo from "../../assets/octoBichrome.png"

interface LoginBoxProps {}


const LoginBox: FC<LoginBoxProps> = () => {
  const auth = useAuth()

  /*const handle0Auth2Login = () => {
    // Renvoie vers l'autorité en charge 0Auth2, pour qu'il prenne en charge le login SSO (authorizationEndpoint)
    // window.location.href = `${authority}?${new URLSearchParams(authenticationInfo)}`
    signIn(authenticationInfo)
  };*/

  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [errorEmail, setErrorEmail] = useState(false)
  const [errorPass, setErrorPass] = useState(false)

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handlePassChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPass(e.target.value)
  }
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorEmail(true)
    } if (!pass.trim()) {
      setErrorPass(true)
    } else {
      setErrorEmail(false)
      setErrorPass(false)
    }
  }

  return (
    <div className="LoginBox">
      <img className="Bichrome" src={octoLogo} alt="BichromeLogo"></img>
      <h1>Se connecter</h1>
      <form onSubmit={handleSubmit}>
        <TextBox
          type="email"
          label="Email"
          value={name}
          name="email"
          error={errorEmail}
          onChange={handleNameChange}
          placeholder="Veuillez saisir votre email"
        />
        <TextBox
          type="password"
          label="Mot de passe"
          value={pass}
          name="password"
          error={errorPass}
          onChange={handlePassChange}
          placeholder="Veuillez saisir votre mot de passe"
        />
        <button className="sbtn" type="submit">Connexion</button>
      </form>
      <hr/>
        <button className="btn" onClick={() => auth.signinRedirect()}>Continuer avec Google</button>
    </div>
)};

export default LoginBox;
