import React from 'react';
import { act, render, screen } from '@testing-library/react';
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
  const { createElement, forwardRef } = jest.requireActual('react');
  return {
    __esModule: true,
    default: forwardRef(({ url }: { url: string }, _ref: unknown) =>
      createElement('div', { 'data-testid': 'player', 'data-url': url }),
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
});
