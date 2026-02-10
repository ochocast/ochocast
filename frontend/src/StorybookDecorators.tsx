import React, { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from './i18n';
import { BrandingContextType } from './branding/types';
import { User } from './utils/VideoProperties';
import { BrandingContext } from './context/BrandingContext';
import { UserContext } from './context/UserContext';
import { applyTheme } from './utils/theme';

// Mock User Context
const mockUser: User = {
  id: '1',
  username: 'JohnDoe',
  email: 'john@example.com',
  role: 'user',
  picture_id: '/ochoIconFull.svg',
  firstName: 'John',
  lastName: 'down',
  createdAt: new Date(),
  description: '',
};

const mockUserContext = {
  user: mockUser,
  isAuthenticated: true,
  isLoading: false,
  accessToken: 'mock-token',
  login: async () => {},
  logout: async () => {},
  hasRole: (role: string) => role === 'user',
  isAdmin: false,
};

// Mock Branding Context
const mockBranding: BrandingContextType = {
  appName: 'OchoCast',
  colors: {
    primary: '#007bff',
    secondary: '#6c757d',
    background: '#ffffff',
    accent: '#ffc107',
    error: '#dc3545',
  },
  images: {
    logo: '::default::ochoIconFull.svg',
    search: '::default::search.svg',
    add: '::default::add.svg',
  },
  getImageUrl: async (key: string) => {
    if (key === 'logo') return '/ochoIconFull.svg';
    if (key === 'search') return '/search.svg';
    if (key === 'add') return '/add.svg';
    return null;
  },
};

export const WithProviders = (Story: React.FC) => {
  useEffect(() => {
    applyTheme(mockBranding);
  }, []);

  return (
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <UserContext.Provider value={mockUserContext}>
          <BrandingContext.Provider value={mockBranding}>
            <Story />
          </BrandingContext.Provider>
        </UserContext.Provider>
      </I18nextProvider>
    </MemoryRouter>
  );
};
