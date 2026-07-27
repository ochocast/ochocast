import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { api, loginUser } from './api';
import { ProtectedRoutes } from './ProtectedRoutes';

jest.mock('react-oidc-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./api', () => ({
  api: {
    setHeaders: jest.fn(),
    deleteHeader: jest.fn(),
  },
  loginUser: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedSetHeaders = api.setHeaders as jest.Mock;
const mockedLoginUser = loginUser as jest.Mock;

describe('ProtectedRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoginUser.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'user-id' },
    });
    mockedUseAuth.mockReturnValue({
      activeNavigator: null,
      isAuthenticated: true,
      isLoading: false,
      user: {
        access_token: 'current-token',
        expired: false,
      },
      signinRedirect: jest.fn(),
      signinSilent: jest.fn(),
      removeUser: jest.fn(),
    });
  });

  it('configures the current token before protected child effects run', async () => {
    const childRequest = jest.fn();

    const ProtectedChild = () => {
      useEffect(() => {
        childRequest();
      }, []);

      return <div>Protected content</div>;
    };

    render(
      <MemoryRouter initialEntries={['/search?q=test']}>
        <ProtectedRoutes>
          <ProtectedChild />
        </ProtectedRoutes>
      </MemoryRouter>,
    );

    await screen.findByText('Protected content');
    await waitFor(() => expect(childRequest).toHaveBeenCalledTimes(1));

    expect(mockedSetHeaders).toHaveBeenCalledWith({
      Authorization: 'Bearer current-token',
    });
    expect(mockedSetHeaders.mock.invocationCallOrder[0]).toBeLessThan(
      childRequest.mock.invocationCallOrder[0],
    );
  });
});
