//Create a prtected route component that extends react-router-dom Route and uses react-oidc-context authProvider to check if the user is authenticated. If the user is not authenticated, the component redirects to the login page.

import React, { FC } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

interface ProtectedRouteProps {
  /* eslint-disable */
  Element: React.ComponentType<any>;
}

const ProtectedRoute: FC<ProtectedRouteProps> = ({ Element }) => {
  const auth = useAuth();
  const [isLoading, setIsLoading] = React.useState(auth.isLoading);

  React.useEffect(() => {
    setIsLoading(auth.isLoading);
  }, [auth]);

  if (!isLoading && !auth.isAuthenticated) {
    return <Navigate to="/" />;
  }
  if (!isLoading && auth.isAuthenticated) {
    return <Element />;
  }

  return (
    <div>
      <h1>Checking your authorization...</h1>
    </div>
  );
};

export default ProtectedRoute;
