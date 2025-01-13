import React from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import logger from '../../utils/logger';

function LoadingPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        logger.info('Authenticated');
        navigate('/home');
      } else {
        logger.info('Not authenticated');
        navigate('/');
      }
    }
    return;
  }, [auth, navigate]);

  return (
    <div>
      <h1>Connexion/Déconnexion en cours...</h1>
    </div>
  );
}

export default LoadingPage;
