import React from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

function LoadingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  React.useEffect(() => {
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        logger.info('Authenticated');
        navigate('/');
      } else {
        logger.info('Not authenticated');
        navigate('*');
      }
    }
    return;
  }, [auth, navigate]);

  return (
    <div>
      <h1>{t('LoggingInOut')}</h1>
    </div>
  );
}

export default LoadingPage;
