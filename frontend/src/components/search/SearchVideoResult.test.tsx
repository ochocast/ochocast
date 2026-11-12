import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '../../testUtils/initTestI18n';
import SearchVideoResult from './SearchVideoResult';
import { SearchHit } from '../../utils/searchApi';

jest.mock('react-router-dom', () => ({
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

jest.mock('../../utils/api', () => ({
  getMiniature: jest.fn(),
}));

const { getMiniature } = jest.requireMock('../../utils/api');

const passage = (start: number, best: boolean, text: string) => ({
  start,
  end: start + 20,
  best,
  parts: [
    { text: 'On a choisi ', hit: false },
    { text, hit: true },
    { text: ' pour la suite', hit: false },
  ],
});

const k8s: SearchHit = {
  video: {
    id: 'vid-k8s',
    title: 'Déployer une plateforme vidéo sur Kubernetes',
    miniature_id: 'm1',
    duration: 3723,
    views: 42,
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    creator: {
      id: 'u1',
      username: 'demo',
      firstName: 'Dem',
      lastName: 'O',
    },
    speakers: ['Alice Martin', 'Bob Durand'],
    tags: ['kubernetes'],
  },
  titleParts: [
    { text: 'Déployer une plateforme vidéo sur ', hit: false },
    { text: 'Kubernetes', hit: true },
  ],
  matchedIn: ['title', 'tags', 'transcript'],
  score: 1,
  passageCount: 3,
  passages: [
    passage(95.7, true, 'Kubernetes'),
    passage(754, false, 'kubernetes bis'),
    passage(1012, true, 'Kubernetes'),
    passage(1870, false, 'kubernetes ter'),
    passage(2560, true, 'Kubernetes'),
  ],
};

beforeEach(() => {
  getMiniature.mockResolvedValue({ data: 'https://cdn/miniature.png' });
});

/** Renders the card and waits for the miniature to load (no stray updates). */
const renderCard = async (hit: SearchHit, query: string) => {
  const view = render(<SearchVideoResult hit={hit} query={query} />);
  await waitFor(() =>
    expect(view.container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/miniature.png',
    ),
  );
  return view;
};

/** A hit as a backend that omits optional fields could send it. */
const sparseHit = (overrides: Record<string, unknown>): SearchHit =>
  ({ ...k8s, ...overrides }) as unknown as SearchHit;

describe('SearchVideoResult', () => {
  it('shows the 3 best passages in time order', async () => {
    await renderCard(k8s, 'kubernetes');
    const links = await screen.findAllByRole('link', { name: /^\d+:\d{2}/ });
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('1:35'),
      expect.stringContaining('16:52'),
      expect.stringContaining('42:40'),
    ]);
  });

  it('expands to all passages', async () => {
    await renderCard(k8s, 'kubernetes');
    const more = await screen.findByRole('button', {
      name: 'Voir les 2 autres passages',
    });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);

    const links = screen.getAllByRole('link', { name: /^\d+:\d{2}/ });
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('1:35'),
      expect.stringContaining('12:34'),
      expect.stringContaining('16:52'),
      expect.stringContaining('31:10'),
      expect.stringContaining('42:40'),
    ]);
    const less = screen.getByRole('button', {
      name: 'Afficher moins de passages',
    });
    expect(less).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(less);
    expect(screen.getAllByRole('link', { name: /^\d+:\d{2}/ })).toHaveLength(3);
  });

  it('links a passage to the video at its start', async () => {
    await renderCard(k8s, 'kubernetes');
    const links = await screen.findAllByRole('link', { name: /^\d+:\d{2}/ });
    expect(links[0]).toHaveAttribute(
      'href',
      '/video/vid-k8s?t=95&q=kubernetes',
    );
    expect(links[1]).toHaveAttribute(
      'href',
      '/video/vid-k8s?t=1012&q=kubernetes',
    );
  });

  it('encodes the query in links', async () => {
    await renderCard(k8s, '"a b" -c');
    const links = await screen.findAllByRole('link', { name: /^\d+:\d{2}/ });
    expect(links[0]).toHaveAttribute(
      'href',
      `/video/vid-k8s?t=95&q=${encodeURIComponent('"a b" -c')}`,
    );
  });

  it('links the title to the video start with q', async () => {
    await renderCard(k8s, 'kubernetes');
    const title = await screen.findByRole('link', {
      name: 'Déployer une plateforme vidéo sur Kubernetes',
    });
    expect(title).toHaveAttribute('href', '/video/vid-k8s?q=kubernetes');
  });

  it('links the title without q when there is no keyword', async () => {
    await renderCard(
      { ...k8s, matchedIn: [], passages: [], passageCount: 0 },
      '',
    );
    const title = await screen.findByRole('link', {
      name: 'Déployer une plateforme vidéo sur Kubernetes',
    });
    expect(title).toHaveAttribute('href', '/video/vid-k8s');
    expect(screen.queryByText('Trouvé dans :')).not.toBeInTheDocument();
    expect(screen.queryByText('▶')).not.toBeInTheDocument();
  });

  it('shows found-in badges', async () => {
    await renderCard(k8s, 'kubernetes');
    const row = (await screen.findByText('Trouvé dans :')).parentElement!;
    expect(within(row).getByText('Titre')).toBeInTheDocument();
    expect(within(row).getByText('Tags')).toBeInTheDocument();
    expect(
      within(row).getByText('Transcription · 3 passages'),
    ).toBeInTheDocument();
    expect(within(row).queryByText('Intervenants')).not.toBeInTheDocument();
  });

  it('uses the singular for one passage', async () => {
    await renderCard(
      {
        ...k8s,
        passageCount: 1,
        passages: [passage(95, true, 'Kubernetes')],
      },
      'kubernetes',
    );
    expect(
      await screen.findByText('Transcription · 1 passage'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /autre/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the meta line and the thumbnail badges', async () => {
    await renderCard(k8s, 'kubernetes');
    expect(
      await screen.findByText(
        /demo · il y a 3 jours · Alice Martin, Bob Durand/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1:02:03')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(getMiniature).toHaveBeenCalledWith('vid-k8s');
  });

  it('highlights hits with mark elements', async () => {
    const { container } = await renderCard(k8s, 'kubernetes');
    await screen.findAllByRole('link', { name: /^\d+:\d{2}/ });
    // 1 in the title + 1 per visible passage
    expect(container.querySelectorAll('mark')).toHaveLength(4);
  });

  it('shows markup in a title literally', async () => {
    const hit: SearchHit = {
      ...k8s,
      titleParts: [{ text: '<b>test</b>', hit: false }],
      passages: [],
      passageCount: 0,
    };
    const { container } = await renderCard(hit, 'test');
    expect(await screen.findByText('<b>test</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('reads a passage without the decorative symbols', async () => {
    await renderCard(k8s, 'kubernetes');
    const link = await screen.findByRole('link', {
      name: /^16:52 On a choisi Kubernetes pour la suite$/,
    });
    const hidden = link.querySelectorAll('[aria-hidden="true"]');
    expect(Array.from(hidden).map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['▶', '«', '»']),
    );
  });

  describe('when the backend omits fields', () => {
    it('falls back to the video title when titleParts is missing', async () => {
      await renderCard(
        sparseHit({
          titleParts: undefined,
          matchedIn: [],
          passages: [],
          passageCount: 0,
        }),
        '',
      );
      expect(
        await screen.findByRole('link', {
          name: 'Déployer une plateforme vidéo sur Kubernetes',
        }),
      ).toBeInTheDocument();
    });

    it('falls back to the video title when titleParts is empty', async () => {
      await renderCard(
        sparseHit({
          titleParts: [],
          matchedIn: [],
          passages: [],
          passageCount: 0,
        }),
        '',
      );
      expect(
        await screen.findByRole('link', {
          name: 'Déployer une plateforme vidéo sur Kubernetes',
        }),
      ).toBeInTheDocument();
    });

    it('renders without speakers, tags, passages and matchedIn', async () => {
      const hit = sparseHit({
        video: { ...k8s.video, speakers: undefined, tags: undefined },
        passages: undefined,
        matchedIn: undefined,
      });
      await renderCard(hit, 'kubernetes');
      expect(
        await screen.findByText(/demo · il y a 3 jours$/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Trouvé dans :')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows the first 3 passages when none is marked best', async () => {
      await renderCard(
        sparseHit({
          passages: k8s.passages.map((p) => ({ ...p, best: false })),
        }),
        'kubernetes',
      );
      const links = await screen.findAllByRole('link', {
        name: /^\d+:\d{2}/,
      });
      expect(links.map((l) => l.textContent)).toEqual([
        expect.stringContaining('1:35'),
        expect.stringContaining('12:34'),
        expect.stringContaining('16:52'),
      ]);
      expect(
        screen.getByRole('button', { name: 'Voir les 2 autres passages' }),
      ).toBeInTheDocument();
    });
  });

  describe('miniature fallback', () => {
    it('uses the branded fallback when the miniature cannot be loaded', async () => {
      getMiniature.mockRejectedValue(new Error('404'));
      const { container } = render(
        <SearchVideoResult
          hit={k8s}
          query="kubernetes"
          fallbackMiniatureUrl="https://cdn/brand-default.png"
        />,
      );
      await waitFor(() => expect(getMiniature).toHaveBeenCalledWith('vid-k8s'));
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://cdn/brand-default.png',
      );
    });

    it('keeps the static image as last resort', async () => {
      getMiniature.mockRejectedValue(new Error('404'));
      const { container } = render(
        <SearchVideoResult hit={k8s} query="kubernetes" />,
      );
      await waitFor(() => expect(getMiniature).toHaveBeenCalledWith('vid-k8s'));
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        '/branding/exemple/image_tuile_event.png',
      );
    });
  });
});
