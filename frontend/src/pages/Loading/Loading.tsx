import React from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import logger from '../../utils/logger';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import styles from './LoadingPage.module.css';

function LoadingPage() {
  const auth = useAuth();
  const navigate = useNavigate();

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
    <div className={styles.loadingPage}>
      <LoadingCircle />
    </div>
  );
}

export default LoadingPage;
