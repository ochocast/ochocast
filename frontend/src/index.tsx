import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { WebStorageStateStore } from 'oidc-client-ts';

import { AuthProvider } from 'react-oidc-context';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import getEnv from './utils/env';

// Config necessary to access authority login page
const oidcConfig = {
  authority: getEnv('REACT_APP_AUTHORIZATION_ENDPOINT')!,
  client_id: getEnv('REACT_APP_CLIENT_ID')!,
  redirect_uri: getEnv('REACT_APP_REDIRECT_URI')!,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider {...oidcConfig}>
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
