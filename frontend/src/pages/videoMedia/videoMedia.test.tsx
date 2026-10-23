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
import { Video } from '../../utils/VideoProperties';
import VideoMedia from './videoMedia';

// Jest here cannot load react-router 7 (package exports): the route id is
// driven by hand, like a navigation between /video/A and /video/B.
let mockVideoId = 'A';
jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocation: () => ({ pathname: `/video/${mockVideoId}`, state: null }),
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
  getVideoProcessing: jest.fn(),
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

const mockedGetVideo = getVideo as jest.Mock;
const mockedGetMedia = getMedia as jest.Mock;

const videoFor = (id: string) =>
  ({
    id,
    media_id: `${id}/master.m3u8`,
    miniature_id: '',
    title: `Title ${id}`,
    description: '',
    creator: {
      id: 'creator',
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      description: '',
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    internal_speakers: [],
    external_speakers: '',
    views: 0,
    tags: [],
    transcoding_status: 'ready',
  }) as unknown as Video;

const found = (id: string) => ({ ok: true, status: 200, data: [videoFor(id)] });

/** Answers getVideo(id) only when the test says so. */
const holdVideo = () => {
  const answers = new Map<string, () => void>();
  mockedGetVideo.mockImplementation(
    (id: string) =>
      new Promise((resolve) => {
        answers.set(id, () => resolve(found(id)));
      }),
  );
  return async (id: string) => {
    await act(async () => {
      answers.get(id)?.();
    });
  };
};

/** Opens video A, then moves the same page to video B. */
const openAThenB = async () => {
  mockVideoId = 'A';
  let rerender: (ui: React.ReactElement) => void = () => undefined;
  await act(async () => {
    ({ rerender } = render(<VideoMedia />));
  });
  mockVideoId = 'B';
  await act(async () => {
    rerender(<VideoMedia />);
  });
};

// CRA resets every mock before each test.
beforeEach(() => {
  (getUsers as jest.Mock).mockResolvedValue({ ok: true, data: { users: [] } });
  (getSubtitle as jest.Mock).mockResolvedValue({ ok: false, data: {} });
  (getComments as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (getLikedComments as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (getVideoSuggestions as jest.Mock).mockResolvedValue({ ok: true, data: [] });
  (incrementVideoViews as jest.Mock).mockResolvedValue({ data: { views: 1 } });
  (isVideoFavorite as jest.Mock).mockResolvedValue(false);
  mockedGetMedia.mockImplementation(async (id: string) => ({
    ok: true,
    data: `https://cdn/${id}/master.m3u8`,
  }));
  window.scrollTo = jest.fn();
  sessionStorage.clear();
  localStorage.clear();
});

describe('VideoMedia', () => {
  // The page stays mounted across /video/:videoId (back/forward, header).
  it('ignores the previous video when it answers after the next one', async () => {
    const answer = holdVideo();
    await openAThenB();
    await answer('B');

    await answer('A');

    expect(
      screen.getByRole('heading', { name: 'Title B' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Title A')).not.toBeInTheDocument();
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      'https://cdn/B/master.m3u8',
    );
    expect(mockedGetMedia).not.toHaveBeenCalledWith('A');
  });

  it('keeps loading the next video when the previous one answers first', async () => {
    const answer = holdVideo();
    await openAThenB();

    await answer('A');

    // Neither A's page nor B's "not found": B is still loading.
    expect(screen.queryByText('Title A')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '404 - Page introuvable' }),
    ).not.toBeInTheDocument();

    await answer('B');

    expect(
      screen.getByRole('heading', { name: 'Title B' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('player')).toHaveAttribute(
      'data-url',
      'https://cdn/B/master.m3u8',
    );
  });
});
