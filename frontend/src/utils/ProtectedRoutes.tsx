import React, { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate, useLocation } from 'react-router-dom';
import LoadingPage from '../pages/Loading/Loading';
import { api, loginUser } from './api';

const REDIRECT_PATH_KEY = 'ochocast_redirect_path';

interface ProtectedRoutesProps {
  children: React.ReactNode;
}
export function ProtectedRoutes(props: ProtectedRoutesProps) {
  const auth = useAuth();
  const {
    activeNavigator,
    isAuthenticated,
    isLoading,
    signinRedirect,
    signinSilent,
    user: oidcUser,
  } = auth;
  const navigate = useNavigate();
  const location = useLocation();

  // Mettre à jour le token dans localStorage quand le token change (ex: renouvellement)
  useEffect(() => {
    if (oidcUser?.access_token) {
      const userString = localStorage.getItem('backendUser');
      if (userString) {
        try {
          const user = JSON.parse(userString);
          if (user.token !== oidcUser.access_token) {
            user.token = oidcUser.access_token;
            localStorage.setItem('backendUser', JSON.stringify(user));
            console.log('Token updated in localStorage');
          }
        } catch (e) {
          console.error('Error updating token in localStorage:', e);
        }
      }
    }
  }, [oidcUser?.access_token]);

  useEffect(() => {
    if (isLoading || activeNavigator) {
      return;
    }

    if (oidcUser && !oidcUser.expired) {
      // Utilisation du token pour configurer les headers de l'API
      api.setHeaders({ Authorization: `Bearer ${oidcUser.access_token}` });

      // Récupération des informations utilisateur via le backend
      const fetchBackendUser = async () => {
        try {
          const res = await loginUser();
          if (!res.ok) {
            console.error('Failed to authenticate with backend:', res.problem);
            localStorage.removeItem('backendUser');
            await auth.removeUser();
            await auth.signinRedirect();
            return;
          }
          // Stocker les données utilisateur ET le token pour les requêtes XHR
          const userWithToken = {
            ...res.data,
            token: oidcUser.access_token,
          };
          localStorage.setItem('backendUser', JSON.stringify(userWithToken));

          // Après authentification réussie, rediriger vers l'URL sauvegardée
          const savedPath = sessionStorage.getItem(REDIRECT_PATH_KEY);
          if (savedPath) {
            sessionStorage.removeItem(REDIRECT_PATH_KEY);
            navigate(savedPath, { replace: true });
          }
        } catch (error) {
          console.error(`Failed to fetch user: ${error}`);
        }
      };

      void fetchBackendUser();
      return;
    }

    if (!oidcUser) {
      // Sauvegarder le chemin actuel avant la redirection vers OIDC
      const currentPath = location.pathname + location.search;
      if (currentPath && currentPath !== '/') {
        sessionStorage.setItem(REDIRECT_PATH_KEY, currentPath);
      }

      void signinRedirect().catch((error) => {
        console.error('Unable to start OIDC login:', error);
      });
      return;
    }

    void signinSilent()
      .then((user) => {
        if (!user) return signinRedirect();
      })
      .catch((error) => {
        console.error('Silent token renewal failed:', error);
        return signinRedirect();
      });
  }, [
    activeNavigator,
    auth,
    isLoading,
    oidcUser,
    signinRedirect,
    signinSilent,
    location.pathname,
    location.search,
    navigate,
  ]);

  if (isAuthenticated) {
    return <>{props.children}</>;
  }

  return <LoadingPage />;
}
