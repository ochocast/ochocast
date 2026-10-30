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
import VideoMedia from './videoMedia';

// Jest here cannot load react-router 7 (package exports): the route is
// stubbed.
jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocation: () => ({ pathname: '/video/A', state: null }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ videoId: 'A' }),
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

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) =>
    jest.requireActual('react').createElement('div', null, children),
}));

jest.mock('react-player/lazy', () => {
  const { createElement, forwardRef, useImperativeHandle, useRef } =
    jest.requireActual('react');
  return {
    __esModule: true,
    default: forwardRef(({ url }: { url: string }, ref: unknown) => {
      const element = useRef(null);
      useImperativeHandle(ref, () => ({
        getInternalPlayer: () => element.current,
      }));
      return createElement('video', {
        'data-testid': 'player',
        'data-url': url,
        ref: element,
      });
    }),
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
    render(<VideoMedia />);
    await settle();
    const player = screen.getByTestId('player');
    expect(player).toBeEmptyDOMElement();

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
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown video', async () => {
    (getVideo as jest.Mock).mockResolvedValue({ ok: true, data: [] });
    render(<VideoMedia />);
    await settle();

    expect(screen.getByText('404')).toBeInTheDocument();
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
    expect(screen.getByText('errorLoadingVideo')).toBeInTheDocument();
    expect(screen.queryByText('404')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await settle();
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      sourceUrl(1),
    );
  });
});
