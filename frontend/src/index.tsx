import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from 'react-oidc-context';

const authority = process.env.REACT_APP_AUTHORIZATION_ENDPOINT!

const oidcConfig  = {
  authority : authority,
  client_id : process.env.REACT_APP_CLIENT_ID!,
  // "response_type": "code",
  redirect_uri: process.env.REACT_APP_REDIRECT_URI!,
  // "scope": "profile",
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider {...oidcConfig}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
