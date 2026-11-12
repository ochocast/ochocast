import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../../testUtils/initTestI18n';
import GlobalSearchPage from './globalSearch';
import { SearchHit, SearchResult } from '../../utils/searchApi';

let mockSearch = '';
const mockNavigate = jest.fn();
const mockGetImageUrl = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/search', search: mockSearch }),
  useNavigate: () => mockNavigate,
  Link: ({
    to,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('../../utils/searchApi', () => ({
  searchContent: jest.fn(),
}));

jest.mock('../../utils/api', () => ({
  getPublishedEvents: jest.fn(),
  getEventsMiniature: jest.fn(),
  getMiniature: jest.fn(),
}));

jest.mock('../../context/BrandingContext', () => ({
  useBrandingContext: () => ({ getImageUrl: mockGetImageUrl }),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// The event card has its own dependencies (user context, subscriptions...).
jest.mock('../../components/ReworkComponents/Event/EventBox/EventBox', () => ({
  __esModule: true,
  default: ({ event }: { event: { name: string } }) => (
    <div data-testid="event-card">{event.name}</div>
  ),
}));

const { searchContent } = jest.requireMock('../../utils/searchApi');
const { getPublishedEvents, getEventsMiniature, getMiniature } =
  jest.requireMock('../../utils/api');

const passage = (start: number, best: boolean) => ({
  start,
  end: start + 20,
  best,
  parts: [
    { text: 'On a choisi ', hit: false },
    { text: 'Kubernetes', hit: true },
    { text: ' pour la suite', hit: false },
  ],
});

const buildHit = (
  id: string,
  title: string,
  passageCount = 0,
  passages: SearchHit['passages'] = [],
): SearchHit => ({
  video: {
    id,
    title,
    miniature_id: 'm',
    duration: 600,
    views: 3,
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    creator: { id: 'u1', username: 'demo', firstName: 'D', lastName: 'O' },
    speakers: [],
    tags: [],
  },
  titleParts: [{ text: title, hit: false }],
  matchedIn: passageCount > 0 ? ['title', 'tags', 'transcript'] : ['title'],
  score: 1,
  passageCount,
  passages,
});

const k8s = buildHit(
  'vid-k8s',
  'Déployer une plateforme vidéo sur Kubernetes',
  3,
  [passage(95, true), passage(1012, true), passage(2560, false)],
);
const other = buildHit('vid-other', 'Une autre vidéo sur les conteneurs');

const result = (
  videos: SearchHit[],
  total = videos.length,
  passageTotal = 0,
): SearchResult => ({ query: 'kubernetes', total, passageTotal, videos });

const event = (id: string, name: string) => ({
  id,
  name,
  description: '',
  startDate: '2026-11-01T10:00:00Z',
  endDate: '2026-11-01T12:00:00Z',
  closed: false,
  tags: [],
  tracks: [],
  creator: { firstName: 'A', lastName: 'B' },
});

const renderPage = (search: string) => {
  mockSearch = search;
  return render(<GlobalSearchPage />);
};

afterEach(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  mockSearch = '';
  mockGetImageUrl.mockResolvedValue('');
  getPublishedEvents.mockResolvedValue({ data: [] });
  // Miniatures never resolve: no state update after the render.
  getEventsMiniature.mockReturnValue(new Promise(() => {}));
  getMiniature.mockReturnValue(new Promise(() => {}));
  searchContent.mockResolvedValue(result([k8s], 1, 3));
});

describe('GlobalSearchPage', () => {
  it('calls the API with the URL filters', async () => {
    renderPage(
      '?q=kubernetes&tags=devops,k8s&users=demo&dateFrom=2026-01-01&dateTo=2026-12-31&favoris=true&archived=false&sort=recent',
    );

    await screen.findByText('Déployer une plateforme vidéo sur Kubernetes');
    expect(searchContent).toHaveBeenCalledTimes(1);
    expect(searchContent).toHaveBeenCalledWith({
      q: 'kubernetes',
      tags: 'devops,k8s',
      users: 'demo',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      favoris: true,
      archived: false,
      sort: 'recent',
      limit: 20,
      offset: 0,
    });
  });

  it('does not call the API without a query or a filter', async () => {
    renderPage('');

    expect(
      await screen.findByText('Rechercher dans les vidéos et les événements'),
    ).toBeInTheDocument();
    expect(searchContent).not.toHaveBeenCalled();
  });

  it('shows the passages counter', async () => {
    renderPage('?q=kubernetes');

    expect(
      await screen.findByText('3 passages dans les sous-titres'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 vidéos trouvées', { selector: 'button' }));
    expect(screen.getByText('Résultats totaux: 1')).toBeInTheDocument();
  });

  it('switches sort to recent', async () => {
    renderPage('?q=kubernetes&tags=devops');

    const relevance = await screen.findByRole('button', {
      name: 'Pertinence',
    });
    const recent = screen.getByRole('button', { name: 'Plus récentes' });
    expect(relevance).toHaveAttribute('aria-pressed', 'true');
    expect(recent).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(recent);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/search?q=kubernetes&tags=devops&sort=recent',
      { replace: true },
    );
  });

  it('loads more videos with offset', async () => {
    searchContent.mockResolvedValueOnce(result([k8s], 2, 3));
    let resolveMore: (value: SearchResult) => void = () => {};
    searchContent.mockReturnValueOnce(
      new Promise<SearchResult>((resolve) => {
        resolveMore = resolve;
      }),
    );
    renderPage('?q=kubernetes');

    const more = await screen.findByRole('button', {
      name: 'Afficher plus de vidéos',
    });
    fireEvent.click(more);

    expect(searchContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'kubernetes', limit: 20, offset: 1 }),
    );
    expect(screen.getByRole('button', { name: 'Chargement…' })).toBeDisabled();

    resolveMore(result([other], 2, 3));

    expect(
      await screen.findByText('Une autre vidéo sur les conteneurs'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Déployer une plateforme vidéo sur Kubernetes'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Afficher plus de vidéos' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the loaded videos when loading more fails', async () => {
    searchContent.mockResolvedValueOnce(result([k8s], 2, 3));
    searchContent.mockRejectedValueOnce(new Error('boom'));
    searchContent.mockResolvedValueOnce(result([other], 2, 3));
    renderPage('?q=kubernetes');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Afficher plus de vidéos' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les vidéos.',
    );
    expect(
      screen.getByText('Déployer une plateforme vidéo sur Kubernetes'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(
      await screen.findByText('Une autre vidéo sur les conteneurs'),
    ).toBeInTheDocument();
    expect(searchContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1 }),
    );
  });

  it('shows the empty state without suggestion', async () => {
    getPublishedEvents.mockResolvedValue({
      data: [event('e1', 'Atelier zzz')],
    });
    searchContent.mockResolvedValue(result([], 0, 0));
    renderPage('?q=zzz');

    expect(
      await screen.findByText('Aucune vidéo ne correspond à « zzz ».'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vérifiez l’orthographe.')).toBeInTheDocument();
    expect(
      screen.getByText('Essayez un mot plus général.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Retirez un terme exclu avec -.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vouliez-vous dire/)).not.toBeInTheDocument();
    expect(screen.getByTestId('event-card')).toBeInTheDocument();
  });

  it('shows the same wording on the page-level empty state', async () => {
    searchContent.mockResolvedValue(result([], 0, 0));
    renderPage('?q=zzz');

    expect(
      await screen.findByText('Aucun résultat trouvé'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Aucune vidéo ne correspond à « zzz ».'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vérifiez l’orthographe.')).toBeInTheDocument();
    expect(screen.queryByText(/Vouliez-vous dire/)).not.toBeInTheDocument();
  });

  it('shows an error with a retry button', async () => {
    getPublishedEvents.mockResolvedValue({
      data: [event('e1', 'Atelier Kubernetes')],
    });
    searchContent.mockRejectedValueOnce(new Error('network down'));
    renderPage('?q=kubernetes');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les vidéos.',
    );
    // The events section keeps working.
    expect(screen.getByTestId('event-card')).toHaveTextContent(
      'Atelier Kubernetes',
    );
    const retry = screen.getByRole('button', { name: 'Réessayer' });
    expect(retry).toHaveAttribute('type', 'button');

    fireEvent.click(retry);

    expect(
      await screen.findByText('Déployer une plateforme vidéo sur Kubernetes'),
    ).toBeInTheDocument();
    expect(searchContent).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists filtered videos without a query', async () => {
    searchContent.mockResolvedValue({
      query: '',
      total: 1,
      passageTotal: 0,
      videos: [buildHit('vid-fav', 'Ma vidéo favorite')],
    });
    renderPage('?favoris=true');

    expect(await screen.findByText('Ma vidéo favorite')).toBeInTheDocument();
    expect(searchContent).toHaveBeenCalledWith({
      favoris: true,
      limit: 20,
      offset: 0,
    });
    expect(searchContent.mock.calls[0][0]).not.toHaveProperty('q');
    expect(
      screen.getByRole('link', { name: 'Ma vidéo favorite' }),
    ).toHaveAttribute('href', '/video/vid-fav');
    expect(screen.queryByText(/dans les sous-titres/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pertinence' }),
    ).not.toBeInTheDocument();
  });

  it('keeps filtering events in the browser', async () => {
    getPublishedEvents.mockResolvedValue({
      data: [
        event('e1', 'Atelier Kubernetes'),
        event('e2', 'Cours de cuisine'),
      ],
    });
    renderPage('?q=kubernetes');

    expect(await screen.findByTestId('event-card')).toHaveTextContent(
      'Atelier Kubernetes',
    );
    expect(screen.getAllByTestId('event-card')).toHaveLength(1);
    expect(screen.queryByText('Cours de cuisine')).not.toBeInTheDocument();
    expect(searchContent).toHaveBeenCalledTimes(1);
  });

  it('debounces the search while the query changes', async () => {
    jest.useFakeTimers();
    const { rerender } = renderPage('?tags=devops');
    await screen.findByText('Déployer une plateforme vidéo sur Kubernetes');
    expect(searchContent).toHaveBeenCalledTimes(1);

    for (const q of ['k', 'ku', 'kub']) {
      mockSearch = `?tags=devops&q=${q}`;
      rerender(<GlobalSearchPage />);
      act(() => {
        jest.advanceTimersByTime(100);
      });
    }
    expect(searchContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(searchContent).toHaveBeenCalledTimes(2);
    expect(searchContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'kub', tags: 'devops', offset: 0 }),
    );
  });
});
