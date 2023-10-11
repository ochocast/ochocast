import React from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';

function LoadingPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        console.log('Authenticated');
        navigate('/events');
      } else {
        console.log('Not authenticated');
        navigate('/');
      }
    }
    return;
  }, [auth, navigate]);

  return (
    <div>
      <h1>Loading...</h1>
    </div>
  );
}

export default LoadingPage;
