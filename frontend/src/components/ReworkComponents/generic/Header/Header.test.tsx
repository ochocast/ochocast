import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../../../../testUtils/initTestI18n';
import Header from './Header';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/home', search: '' }),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../../context/UserContext', () => ({
  useUser: () => ({ user: { username: 'demo' }, isAdmin: false }),
}));

jest.mock('../../../../context/BrandingContext', () => ({
  useBrandingContext: () => ({ appName: 'OchoCast' }),
}));

jest.mock('../../../../utils/api', () => ({
  findTags: jest.fn(),
  findUsers: jest.fn(),
}));

// Children that need the network, OIDC or branding are not under test here.
jest.mock('../../BrandingImage/BrandingImage', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./NavItems/NavItems', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./UserBadge/UserBadge', () => ({ UserBadge: () => null }));
jest.mock('../../navigation/FilterPanel/FilterPanel', () => ({
  __esModule: true,
  default: () => null,
}));

const { findTags, findUsers } = jest.requireMock('../../../../utils/api');

const HELP =
  '"expression exacte" · -mot pour exclure · or pour l’un ou l’autre';

beforeEach(() => {
  findTags.mockResolvedValue({ data: [] });
  findUsers.mockResolvedValue({ data: [] });
  // jsdom has no ResizeObserver.
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

describe('Header search help', () => {
  it('shows the syntax help when the search field is focused and empty', async () => {
    render(<Header />);
    const input = screen.getByPlaceholderText(
      'Rechercher des vidéos et des événements',
    );

    expect(screen.queryByText(HELP)).not.toBeInTheDocument();

    fireEvent.focus(input);
    const help = screen.getByText(HELP);
    expect(input).toHaveAttribute('aria-describedby', help.id);

    await act(async () => {
      fireEvent.change(input, { target: { value: 'kub' } });
    });
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-describedby');

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });
    expect(screen.getByText(HELP)).toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
  });
});
