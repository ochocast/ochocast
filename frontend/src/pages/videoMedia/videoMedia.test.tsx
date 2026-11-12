import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  getComments,
  getLikedComments,
  getMedia,
  getSubtitle,
  getUsers,
  getVideo,
  getVideoSuggestions,
  incrementVideoViews,
  isVideoFavorite,
} from '../../utils/api';
import { getTranscript, TranscriptResult } from '../../utils/searchApi';
import VideoMedia from './videoMedia';
import '../../testUtils/initTestI18n';

// Jest here cannot load react-router 7 (package exports): the route is
// stubbed.
let mockSearch = '';
let mockVideoId = 'A';
jest.mock('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useSearchParams: () => [new URLSearchParams(mockSearch)],
  useLocation: () => ({ pathname: '/video/A', state: null }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ videoId: mockVideoId }),
}));

jest.mock('../../utils/api', () => ({
  addToFavorites: jest.fn(),
  createComment: jest.fn(),
  getComments: jest.fn(),
  getLikedComments: jest.fn(),
  getMedia: jest.fn(),
  getSubtitle: jest.fn(),
  getUsers: jest.fn(),
  getVideo: jest.fn(),
  getVideoSuggestions: jest.fn(),
  incrementVideoViews: jest.fn(),
  isVideoFavorite: jest.fn(),
  removeFromFavorites: jest.fn(),
}));

// The transcript request of the panel never leaves the test.
jest.mock('../../utils/searchApi', () => ({
  getTranscript: jest.fn(),
  SearchApiError: class SearchApiError extends Error {},
}));

const mockMarkdownRender = jest.fn();
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    mockMarkdownRender();
    return jest.requireActual('react').createElement('div', null, children);
  },
}));

// A suggestion card needs the app contexts: the page only lays it out.
const mockThumbnailRender = jest.fn();
jest.mock(
  '../../components/ReworkComponents/video/Thumbnail/Thumbnail',
  () => ({
    __esModule: true,
    default: ({ title }: { title: string }) => {
      mockThumbnailRender();
      return jest.requireActual('react').createElement('div', null, title);
    },
  }),
);

// The stub exposes what the page calls on the player, and a way to fire
// `onReady` like the real player does once the media is loaded, and
// `onProgress` like it does while the video plays.
const mockSeekTo = jest.fn();
let mockPlayerDuration = 2712;
let mockProgress: (state: { playedSeconds: number }) => void = () => {};
jest.mock('react-player/lazy', () => {
  const { createElement, forwardRef, useImperativeHandle, useRef } =
    jest.requireActual('react');
  return {
    __esModule: true,
    default: forwardRef(
      (
        {
          url,
          onReady,
          onProgress,
        }: {
          url: string;
          onReady: (player: unknown) => void;
          onProgress: (state: { playedSeconds: number }) => void;
        },
        ref: unknown,
      ) => {
        mockProgress = onProgress;
        const element = useRef(null);
        const handle = {
          getInternalPlayer: () => element.current,
          getDuration: () => mockPlayerDuration,
          seekTo: (...args: unknown[]) => mockSeekTo(...args),
        };
        useImperativeHandle(ref, () => handle);
        return createElement('video', {
          'data-testid': 'player',
          'data-url': url,
          ref: element,
          onCanPlay: () => onReady(handle),
        });
      },
    ),
  };
});

// The creator card reads the OIDC session; this page only lays it out.
jest.mock(
  '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription',
  () => ({
    ...jest.requireActual(
      '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription',
    ),
    __esModule: true,
    default: () => null,
  }),
);

const HOUR = 60 * 60 * 1000;

// Segments of the k8s video of the reference data set (annex A).
const K8S_LINES: Array<[number, string]> = [
  [12, 'Bonjour à tous, merci d’être venus à cette conférence.'],
  [95, 'On a choisi Kubernetes parce qu’on voulait redéployer.'],
  [260, 'Le cluster tourne sur Talos, chez Scaleway.'],
  [498, 'Le transcodage passe par FFmpeg dans des conteneurs.'],
  [754, 'Notre première erreur : des pods sans limite de mémoire.'],
  [1012, 'Kubernetes redémarre le pod, mais la vidéo est perdue.'],
  [1290, 'Les données personnelles restent dans la base managée.'],
  [1544, 'Pour les sauvegardes, on s’appuie sur celles de l’hébergeur.'],
  [1870, 'Les sous-titres sont générés la nuit.'],
  [2210, 'Si c’était à refaire, on commencerait avec moins de microservices.'],
  [2560, 'Merci, je prends vos questions sur Kubernetes et sur le reste.'],
];

const k8sTranscript = (matches: number[]): TranscriptResult => ({
  videoId: 'A',
  source: 'auto',
  status: 'ready',
  segments: K8S_LINES.map(([start, text], index) => ({
    start,
    end: K8S_LINES[index + 1]?.[0] ?? 2712,
    parts: [{ text, hit: matches.includes(index) }],
  })),
  matches,
});

/** A long video is served from its source, through a presigned URL. */
const sourceUrl = (signature: number) =>
  `https://bucket.example/A/source/original.mp4?X-Amz-Signature=${signature}`;

const video = {
  id: 'A',
  media_id: 'A/source/original.mp4',
  miniature_id: '',
  title: 'Title A',
  description: '',
  creator: {
    id: 'creator',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    description: '',
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  internal_speakers: [],
  external_speakers: '',
  views: 0,
  tags: [],
  duration: 7200,
  transcoding_status: 'ready',
};

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

// CRA resets every mock before each test.
beforeEach(() => {
  jest.useFakeTimers();
  (getUsers as jest.Mock).mockResolvedValue({ ok: true, data: { users: [] } });
  (getVideo as jest.Mock).mockResolvedValue({ ok: true, data: [video] });
  (getSubtitle as jest.Mock).mockResolvedValue({ ok: false, data: {} });
  (getComments as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (getLikedComments as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (getVideoSuggestions as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (incrementVideoViews as jest.Mock).mockResolvedValue({ data: { views: 1 } });
  (isVideoFavorite as jest.Mock).mockResolvedValue(false);
  (getMedia as jest.Mock)
    .mockResolvedValueOnce({ ok: true, data: sourceUrl(1) })
    .mockResolvedValue({ ok: true, data: sourceUrl(2) });
  window.scrollTo = jest.fn();
  sessionStorage.clear();
  mockSearch = '';
  mockVideoId = 'A';
  mockPlayerDuration = 2712;
  (getTranscript as jest.Mock).mockImplementation((_id: string, q: string) =>
    Promise.resolve(k8sTranscript(q ? [1, 5, 10] : [])),
  );
  // jsdom has no layout: the strip measures a 900 px track.
  (window as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private callback: (entries: unknown[]) => void) {}
    observe() {
      this.callback([{ contentRect: { width: 900 } }]);
    }
    disconnect() {}
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VideoMedia', () => {
  // A source is signed for twice its duration plus an hour, and HLS goes
  // through a stable API route. A new URL makes the player reload from the
  // start: a two-hour video served from source must not restart at 55 min.
  it('keeps the media URL of a video that stays open', async () => {
    render(<VideoMedia />);
    await settle();
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      sourceUrl(1),
    );

    await act(async () => {
      jest.advanceTimersByTime(2 * HOUR);
    });
    await settle();

    expect(getMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      sourceUrl(1),
    );
  });

  // The nightly transcript may arrive while the page stays open: the open
  // player gets its track without reloading the media.
  it('adds a transcript that arrives while the video stays open', async () => {
    const subtitleUrl = 'https://bucket.example/subtitle-auto-A.vtt';
    (getVideo as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        data: [{ ...video, transcription_status: 'pending' }],
      })
      // An error page from a proxy must not stop the refresh.
      .mockResolvedValueOnce({ ok: false, data: '<html>Bad gateway</html>' })
      .mockResolvedValue({
        ok: true,
        data: [
          {
            ...video,
            transcription_status: 'ready',
            subtitle_id: 'subtitle-auto-A.vtt',
          },
        ],
      });
    // Without a subtitle the API answers 200 with an empty body.
    (getSubtitle as jest.Mock).mockResolvedValueOnce({ ok: true, data: '' });
    (getTranscript as jest.Mock).mockResolvedValueOnce({
      videoId: 'A',
      source: 'auto',
      status: 'pending',
      segments: [],
      matches: [],
    });
    render(<VideoMedia />);
    await settle();
    const player = screen.getByTestId('player');
    expect(player).toBeEmptyDOMElement();
    expect(
      screen.getByText('Transcription en préparation'),
    ).toBeInTheDocument();

    (getSubtitle as jest.Mock).mockResolvedValue({
      ok: true,
      data: subtitleUrl,
    });
    for (let poll = 0; poll < 2; poll++) {
      await act(async () => {
        jest.advanceTimersByTime(5 * 60 * 1000);
      });
      await settle();
    }

    // The page injects the track into the media element: no query reaches it.
    expect(player.innerHTML).toContain(`src="${subtitleUrl}"`);
    expect(player.innerHTML).toContain('label="Français"');
    expect(getMedia).toHaveBeenCalledTimes(1);
    // The panel reads the transcript again.
    expect(getTranscript).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Transcription en préparation')).toBeNull();
    expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
  });

  const advance = async (...delays: number[]) => {
    for (const ms of delays) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
      await settle();
    }
  };

  // While an upload transcodes, an error page or body never becomes page
  // state. Once it is ready, it shows only with its media and its subtitle:
  // either read is retried 6 s after a failure.
  it.each(['media', 'subtitle'])(
    'retries the %s of an upload that becomes ready',
    async (failing) => {
      const mediaUrl = 'https://bucket.example/A/master.m3u8';
      const subtitleUrl = 'https://bucket.example/subtitle-A.vtt';
      const gateway = { ok: false, data: { statusCode: 502 } };
      const subtitled = { ...video, subtitle_id: 'subtitle-A.vtt' };
      (getVideo as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          data: [{ ...subtitled, transcoding_status: 'pending' }],
        })
        .mockResolvedValueOnce({ ok: false, data: '<html>Bad gateway</html>' })
        .mockResolvedValue({ ok: true, data: [subtitled] });
      (getMedia as jest.Mock)
        .mockReset()
        // The media of a pending upload answers 404.
        .mockResolvedValueOnce({ ok: false, data: { statusCode: 404 } })
        .mockResolvedValueOnce(
          failing === 'media' ? gateway : { ok: true, data: mediaUrl },
        )
        .mockResolvedValue({ ok: true, data: mediaUrl });
      (getSubtitle as jest.Mock)
        .mockResolvedValueOnce(gateway)
        .mockResolvedValueOnce(
          failing === 'subtitle' ? gateway : { ok: true, data: subtitleUrl },
        )
        .mockResolvedValue({ ok: true, data: subtitleUrl });
      render(<VideoMedia />);
      await settle();
      // The error page, then the first ready tick with one failed read.
      await advance(3000, 3000);
      expect(screen.queryByTestId('player')).toBeNull();

      await advance(6000);
      const player = screen.getByTestId('player');
      expect(player).toHaveAttribute('data-url', mediaUrl);
      expect(player.innerHTML).toContain(`src="${subtitleUrl}"`);
    },
  );

  // An upload without a subtitle shows once its media is read: an error body
  // from the subtitle route never becomes its track.
  it('shows an unsubtitled upload without a track when its subtitle read fails', async () => {
    const mediaUrl = 'https://bucket.example/A/master.m3u8';
    (getVideo as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        data: [{ ...video, transcoding_status: 'pending' }],
      })
      .mockResolvedValue({ ok: true, data: [video] });
    (getMedia as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ ok: false, data: { statusCode: 404 } })
      .mockResolvedValue({ ok: true, data: mediaUrl });
    (getSubtitle as jest.Mock)
      .mockResolvedValueOnce({ ok: true, data: '' })
      .mockResolvedValue({
        ok: false,
        data: { statusCode: 500, message: 'Internal server error' },
      });
    render(<VideoMedia />);
    await settle();
    await advance(3000);

    const player = screen.getByTestId('player');
    expect(player).toHaveAttribute('data-url', mediaUrl);
    expect(player).toBeEmptyDOMElement();
  });

  // A ready upload whose reads keep failing (an expired session answers 401)
  // is not polled forever: after spaced retries, the page offers a reload.
  it('stops retrying a ready upload whose media keeps failing', async () => {
    (getVideo as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        data: [{ ...video, transcoding_status: 'pending' }],
      })
      .mockResolvedValue({ ok: true, data: [video] });
    (getMedia as jest.Mock)
      .mockReset()
      .mockResolvedValue({ ok: false, data: { statusCode: 401 } });
    render(<VideoMedia />);
    await settle();
    // Ready ticks at 3, 9, 21, 45 and 93 s.
    await advance(3000, 6000, 12000, 24000, 48000);
    expect(getMedia).toHaveBeenCalledTimes(6);

    await advance(HOUR);
    expect(getMedia).toHaveBeenCalledTimes(6);
    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown video', async () => {
    (getVideo as jest.Mock).mockResolvedValue({ ok: true, data: [] });
    render(<VideoMedia />);
    await settle();

    expect(screen.getByText('404 - Page introuvable')).toBeInTheDocument();
  });

  // Offline, an existing video is neither an endless spinner nor a not-found
  // page: the page offers a retry.
  it('offers a retry when the video cannot be loaded', async () => {
    const offline = { ok: false, problem: 'NETWORK_ERROR', data: null };
    for (const request of [
      getUsers,
      getVideo,
      getSubtitle,
      getComments,
      getLikedComments,
    ])
      (request as jest.Mock).mockResolvedValueOnce(offline);
    (getMedia as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(offline)
      .mockResolvedValue({ ok: true, data: sourceUrl(1) });
    render(<VideoMedia />);
    await settle();
    expect(
      screen.getByText('Erreur lors du chargement de la vidéo'),
    ).toBeInTheDocument();
    expect(screen.queryByText('404 - Page introuvable')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await settle();
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      sourceUrl(1),
    );
  });

  describe('opened from the search results', () => {
    const ready = () => fireEvent.canPlay(screen.getByTestId('player'));
    // The live region of the banner; empty while there is no banner.
    const banner = () => screen.getByRole('status');

    const open = async (search: string) => {
      mockSearch = search;
      render(<VideoMedia />);
      await settle();
      ready();
    };

    it('seeks to t when the player is ready', async () => {
      await open('?t=1012&q=kubernetes');

      expect(mockSeekTo).toHaveBeenCalledTimes(1);
      expect(mockSeekTo).toHaveBeenCalledWith(1012, 'seconds');
    });

    it('seeks once per video, not again when the player reloads', async () => {
      await open('?t=1012&q=kubernetes');
      ready();

      expect(mockSeekTo).toHaveBeenCalledTimes(1);
    });

    it.each(['-5', 'abc', ''])('ignores invalid t (%p)', async (t) => {
      await open(`?t=${t}&q=kubernetes`);

      expect(mockSeekTo).not.toHaveBeenCalled();
      expect(banner()).toBeEmptyDOMElement();
    });

    it('does not seek without t', async () => {
      await open('?q=kubernetes');

      expect(mockSeekTo).not.toHaveBeenCalled();
    });

    it('clamps t to duration', async () => {
      await open('?t=1e9&q=kubernetes');

      expect(mockSeekTo).toHaveBeenCalledWith(2712, 'seconds');
    });

    it('clamps t to the duration of the video when the player has none yet', async () => {
      mockPlayerDuration = 0;
      await open('?t=1e9&q=kubernetes');

      expect(mockSeekTo).toHaveBeenCalledWith(7200, 'seconds');
    });

    it('shows the banner with q for 4.5 s', async () => {
      await open('?t=1012&q=kubernetes');

      expect(screen.getByRole('status')).toHaveTextContent(
        'Lecture à 16:52 · passage trouvé pour « kubernetes »',
      );

      await advance(4400);
      expect(banner()).not.toBeEmptyDOMElement();
      await advance(200);
      expect(banner()).toBeEmptyDOMElement();
    });

    // A live region created with its text may not be announced.
    it('announces the banner through a live region mounted beforehand', async () => {
      mockSearch = '?t=1012&q=kubernetes';
      render(<VideoMedia />);
      await settle();
      const region = banner();
      expect(region).toBeEmptyDOMElement();

      ready();
      expect(banner()).toBe(region);
      expect(region).toHaveTextContent(
        'Lecture à 16:52 · passage trouvé pour « kubernetes »',
      );

      await advance(4600);
      expect(banner()).toBe(region);
      expect(region).toBeEmptyDOMElement();
    });

    it('does not show the banner again on re-render or reload of the player', async () => {
      await open('?t=1012&q=kubernetes');
      await advance(5000);
      ready();
      await settle();

      expect(banner()).toBeEmptyDOMElement();
    });

    it('shows no banner without q', async () => {
      await open('?t=1012');

      expect(mockSeekTo).toHaveBeenCalledWith(1012, 'seconds');
      expect(banner()).toBeEmptyDOMElement();
    });

    it('shows a back link to the results when q is present', async () => {
      await open('?t=1012&q=kube%20%26%20k8s');

      const link = screen.getByRole('link', {
        name: '← Retour aux résultats pour « kube & k8s »',
      });
      expect(link).toHaveAttribute('href', '/search?q=kube%20%26%20k8s');
    });

    // Another video, opened from the suggestions, starts clean.
    it('drops the banner and the passages of the previous video', async () => {
      mockSearch = '?t=1012&q=kubernetes';
      const { rerender } = render(<VideoMedia />);
      await settle();
      ready();
      await settle();
      expect(screen.getByRole('status')).toHaveTextContent(/16:52/);
      expect(screen.getAllByRole('button', { name: /^Aller à/ })).toHaveLength(
        3,
      );

      mockVideoId = 'B';
      mockSearch = '';
      (getVideo as jest.Mock).mockResolvedValue({
        ok: true,
        data: [{ ...video, id: 'B', title: 'Title B' }],
      });
      rerender(<VideoMedia />);
      await settle();

      expect(screen.getByText('Title B')).toBeInTheDocument();
      expect(screen.queryByText(/Lecture à/)).toBeNull();
      expect(screen.queryAllByRole('button', { name: /^Aller à/ })).toEqual([]);
    });

    it('shows no back link without q', async () => {
      await open('?t=1012');

      expect(
        screen.queryByRole('link', { name: /Retour aux résultats/ }),
      ).toBeNull();
    });
  });
  describe('passage strip and transcript panel', () => {
    const open = async (search: string) => {
      mockSearch = search;
      render(<VideoMedia />);
      await settle();
      fireEvent.canPlay(screen.getByTestId('player'));
      await settle();
    };

    const play = (seconds: number) =>
      act(() => {
        mockProgress({ playedSeconds: seconds });
      });

    const markers = () => screen.queryAllByRole('button', { name: /^Aller à/ });
    const line = (time: string) =>
      screen.getByRole('button', { name: new RegExp(`^${time}`) });
    const marker = (time: string) =>
      screen.getByRole('button', { name: new RegExp(`^Aller à ${time} : `) });

    it('renders the strip under the player when there are matches', async () => {
      await open('?q=kubernetes');

      expect(
        markers().map((button) => button.getAttribute('aria-label')),
      ).toEqual([
        'Aller à 1:35 : On a choisi Kubernetes parce qu’on voulait redéployer.',
        'Aller à 16:52 : Kubernetes redémarre le pod, mais la vidéo est perdue.',
        'Aller à 42:40 : Merci, je prends vos questions sur Kubernetes et sur le reste.',
      ]);
      // Before the first passage, no marker is the current one.
      markers().forEach((button) =>
        expect(button).not.toHaveAttribute('aria-current'),
      );
      const strip = screen.getByRole('group', {
        name: 'Passages trouvés dans la vidéo',
      });
      const player = screen.getByTestId('player');
      expect(
        player.compareDocumentPosition(strip) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(getTranscript).toHaveBeenCalledTimes(1);
      expect(getTranscript).toHaveBeenCalledWith('A', 'kubernetes');
    });

    it('hides the strip without matches', async () => {
      await open('');

      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Passages trouvés dans la vidéo' }),
      ).toBeNull();
    });

    it('hides the strip when the search finds nothing', async () => {
      (getTranscript as jest.Mock).mockResolvedValue(k8sTranscript([]));
      await open('?q=nothing');

      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
      expect(markers()).toHaveLength(0);
    });

    it('clicking a strip marker activates the panel line', async () => {
      await open('?t=1012&q=kubernetes');

      expect(line('16:52')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
      expect(marker('16:52')).toHaveAttribute('aria-current', 'true');

      fireEvent.click(marker('42:40'));
      await settle();

      expect(mockSeekTo).toHaveBeenLastCalledWith(2560, 'seconds');
      expect(line('42:40')).toHaveAttribute('aria-current', 'true');
      expect(line('16:52')).not.toHaveAttribute('aria-current');
      expect(screen.getByText('3 / 3')).toBeInTheDocument();
      expect(marker('42:40')).toHaveAttribute('aria-current', 'true');
      expect(marker('16:52')).not.toHaveAttribute('aria-current');
    });

    it('follows playback in the panel and on the strip', async () => {
      await open('?q=kubernetes');
      expect(screen.getByText('0 / 3')).toBeInTheDocument();

      play(100);
      expect(line('1:35')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
      expect(marker('1:35')).toHaveAttribute('aria-current', 'true');

      play(1300);
      expect(line('21:30')).toHaveAttribute('aria-current', 'true');
      expect(line('1:35')).not.toHaveAttribute('aria-current');
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
      expect(marker('16:52')).toHaveAttribute('aria-current', 'true');
      expect(marker('1:35')).not.toHaveAttribute('aria-current');

      play(2600);
      expect(line('42:40')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByText('3 / 3')).toBeInTheDocument();
      expect(marker('42:40')).toHaveAttribute('aria-current', 'true');
    });

    // Result links carry whole seconds, automatic subtitles milliseconds: a
    // start is reached from its whole second.
    it('arrives on a passage whose start has a fraction of a second', async () => {
      (getTranscript as jest.Mock).mockImplementation(() => {
        const transcript = k8sTranscript([1, 5, 10]);
        transcript.segments[5].start = 1012.48;
        return Promise.resolve(transcript);
      });
      await open('?t=1012&q=kubernetes');

      expect(mockSeekTo).toHaveBeenCalledWith(1012, 'seconds');
      expect(line('16:52')).toHaveAttribute('aria-current', 'true');
      expect(line('12:34')).not.toHaveAttribute('aria-current');
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^Aller à 16:52/ }),
      ).toHaveAttribute('aria-current', 'true');
    });

    // The player reports its position twice a second: what does not depend
    // on it is not rendered again.
    it('does not render the description and the suggestions again while playing', async () => {
      const suggestion = (id: string) => ({
        ...video,
        id,
        title: `Suggestion ${id}`,
        tags: [{ name: 'kubernetes' }],
      });
      (getVideoSuggestions as jest.Mock).mockResolvedValue({
        ok: true,
        data: [suggestion('S1'), suggestion('S2'), suggestion('S3')],
      });
      await open('?q=kubernetes');
      expect(screen.getByText('Suggestion S3')).toBeInTheDocument();
      mockThumbnailRender.mockClear();
      mockMarkdownRender.mockClear();

      play(100);
      play(100.5);

      expect(line('1:35')).toHaveAttribute('aria-current', 'true');
      expect(mockThumbnailRender).not.toHaveBeenCalled();
      expect(mockMarkdownRender).not.toHaveBeenCalled();
    });

    it('clicking a transcript line seeks and follows immediately', async () => {
      await open('?q=kubernetes');

      fireEvent.click(line('1:35'));
      await settle();

      expect(mockSeekTo).toHaveBeenLastCalledWith(95, 'seconds');
      expect(line('1:35')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });
});
