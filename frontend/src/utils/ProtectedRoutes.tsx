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
  const navigate = useNavigate();
  const location = useLocation();

  // Mettre à jour le token dans localStorage quand le token change (ex: renouvellement)
  useEffect(() => {
    if (auth.user?.access_token) {
      const userString = localStorage.getItem('backendUser');
      if (userString) {
        try {
          const user = JSON.parse(userString);
          if (user.token !== auth.user.access_token) {
            user.token = auth.user.access_token;
            localStorage.setItem('backendUser', JSON.stringify(user));
            console.log('Token updated in localStorage');
          }
        } catch (e) {
          console.error('Error updating token in localStorage:', e);
        }
      }
    }
  }, [auth.user?.access_token]);

  useEffect(() => {
    if (auth.isLoading) {
      return;
    }
    if (auth.user && !auth.user.expired) {
      // Utilisation du token pour configurer les headers de l'API
      api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });

      // Récupération des informations utilisateur via le backend
      const fetchBackendUser = async () => {
        try {
          const res = await loginUser();
          //console.log('Backend user:', res.data);
          // Stocker les données utilisateur ET le token pour les requêtes XHR
          const userWithToken = {
            ...res.data,
            token: auth.user?.access_token,
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

      fetchBackendUser();
    } else {
      // Sauvegarder le chemin actuel avant la redirection vers OIDC
      const currentPath = location.pathname + location.search;
      if (currentPath && currentPath !== '/') {
        sessionStorage.setItem(REDIRECT_PATH_KEY, currentPath);
      }

      if (auth.user && auth.user.expired) {
        // Renouveler le token si expiré
        auth.signinSilent().then((user) => {
          if (!user) {
            // Rediriger l'utilisateur vers la connexion si non authentifié
            auth.signinRedirect();
          }
        });
      } else {
        // Rediriger l'utilisateur vers la connexion si non authentifié
        auth.signinRedirect();
      }
    }
  }, [auth, location, navigate]);

  if (auth.isAuthenticated) {
    return <>{props.children}</>;
  }

  return <LoadingPage />;
}
