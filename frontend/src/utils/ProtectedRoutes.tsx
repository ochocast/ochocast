//Create a prtected route component that extends react-router-dom Route and uses react-oidc-context authProvider to check if the user is authenticated. If the user is not authenticated, the component redirects to the login page.

import { FC } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

interface ProtectedRouteProps {
  /* eslint-disable */
  Element: React.ComponentType<any>;
}

const ProtectedRoute: FC<ProtectedRouteProps> = ({ Element }) => {
  const auth = useAuth();

  if (!auth.isAuthenticated) {
    return <Navigate to="/" />;
  }

  return <Element />;
};

export default ProtectedRoute;
