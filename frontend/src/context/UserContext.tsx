import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { api, loginUser } from '../utils/api';
import { User } from '../utils/VideoProperties';

interface UserContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
}

export const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);

  // Set API headers when user changes
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.user?.access_token) {
        api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });

        try {
          // Fetch user data from API
          const response = await loginUser();

          if (response.status === 200 && response.data) {
            setUser(response.data);
          } else {
            console.warn('Failed to fetch user data, response:', response);
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser(null);
        }
      } else {
        setUser(null);
        // Clear API headers when user is not authenticated
        api.setHeaders({});
      }
    };

    fetchUserData();
  }, [auth.user]);

  const hasRole = (role: string): boolean => {
    return user?.role === role || false;
  };

  const isAdmin = hasRole('admin') || hasRole('administrator');

  const login = async (): Promise<void> => {
    await auth.signinRedirect();
  };

  const logout = async (): Promise<void> => {
    await auth.signoutRedirect();
  };

  const contextValue: UserContextType = {
    user,
    isAuthenticated: auth.user != null && !auth.user.expired,
    isLoading: auth.isLoading,
    accessToken: auth.user?.access_token || null,
    login,
    logout,
    hasRole,
    isAdmin,
  };

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === null) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
