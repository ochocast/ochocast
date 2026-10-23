import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  createComment,
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

// Suggestions read the branding and user contexts; only their titles matter.
jest.mock(
  '../../components/ReworkComponents/video/Thumbnail/Thumbnail',
  () => ({
    __esModule: true,
    default: ({ title }: { title: string }) =>
      jest
        .requireActual('react')
        .createElement('div', { 'data-testid': 'suggestion' }, title),
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

/** Answers `mock(id)` with `answerFor(id)` only when the test says so. */
const hold = (mock: jest.Mock, answerFor: (id: string) => unknown) => {
  const answers = new Map<string, () => void>();
  mock.mockImplementation(
    (id: string) =>
      new Promise((resolve) => {
        answers.set(id, () => resolve(answerFor(id)));
      }),
  );
  const answer = async (id: string) => {
    await act(async () => {
      answers.get(id)?.();
    });
  };
  /** Answers without a render: answers that land before React renders. */
  answer.now = (id: string) => answers.get(id)?.();
  return answer;
};

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Sends a comment: the video object leaves the page with it. */
const sendComment = async () => {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Hello' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  });
};

const holdVideo = () => hold(mockedGetVideo, found);

/** Opens video A, runs `whileOnA`, then moves the same page to video B. */
const openAThenB = async (whileOnA?: () => Promise<void>) => {
  mockVideoId = 'A';
  let rerender: (ui: React.ReactElement) => void = () => undefined;
  await act(async () => {
    ({ rerender } = render(<VideoMedia />));
  });
  await whileOnA?.();
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

  // The effects keyed on the shown video's id: their answers for A must not
  // land on B either.
  it("ignores the previous video's favorite flag when it answers late", async () => {
    const answerVideo = holdVideo();
    const answerFavorite = hold(
      isVideoFavorite as jest.Mock,
      (id) => id === 'A',
    );
    await openAThenB(() => answerVideo('A'));
    await answerVideo('B');
    await answerFavorite('B');

    await answerFavorite('A');

    expect(screen.getByAltText('Ajouter aux favoris')).toBeInTheDocument();
    expect(screen.queryByAltText('En favoris')).not.toBeInTheDocument();
  });

  it("ignores the previous video's suggestions when its view answers late", async () => {
    const answerVideo = holdVideo();
    const answerViews = hold(incrementVideoViews as jest.Mock, () => ({
      data: { views: 1 },
    }));
    (getVideoSuggestions as jest.Mock).mockImplementation(
      async (id: string) => ({
        ok: true,
        data: [videoFor(`after-${id}`)],
      }),
    );
    await openAThenB(() => answerVideo('A'));
    await answerVideo('B');
    await answerViews('B');

    await answerViews('A');

    expect(screen.getByTestId('suggestion')).toHaveTextContent('Title after-B');
  });

  it("keeps the next video's view count when the previous one's answers late", async () => {
    localStorage.setItem('backendUser', JSON.stringify({ id: 'viewer' }));
    const answerVideo = holdVideo();
    const answerViews = hold(incrementVideoViews as jest.Mock, (id) => ({
      data: { views: id === 'A' ? 999 : 7 },
    }));
    await openAThenB(() => answerVideo('A'));
    await answerVideo('B');
    await answerViews('B');

    await answerViews('A');

    await sendComment();
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ id: 'B', views: 7 }),
      }),
    );
    // Both views are recorded: coming back to either does not count it again.
    expect(JSON.parse(sessionStorage.getItem('viewedVideos') ?? '[]')).toEqual(
      expect.arrayContaining(['A', 'B']),
    );
  });

  it("does not show the previous video's favorite flag while the next one's loads", async () => {
    const answerVideo = holdVideo();
    const answerFavorite = hold(
      isVideoFavorite as jest.Mock,
      (id) => id === 'A',
    );
    await openAThenB(async () => {
      await answerVideo('A');
      await answerFavorite('A');
      expect(screen.getByAltText('En favoris')).toBeInTheDocument();
    });

    await answerVideo('B');

    expect(screen.getByAltText('Ajouter aux favoris')).toBeInTheDocument();
  });

  // B's video and A's count can land before React renders: no commit between
  // them has cancelled A's effect yet. B, seen earlier in the session, is not
  // counted again, so nothing replaces A's count.
  it("keeps the next video's view count when the previous one's lands with it", async () => {
    localStorage.setItem('backendUser', JSON.stringify({ id: 'viewer' }));
    sessionStorage.setItem('viewedVideos', JSON.stringify(['B']));
    const answerVideo = holdVideo();
    const answerViews = hold(incrementVideoViews as jest.Mock, () => ({
      data: { views: 999 },
    }));
    await openAThenB(() => answerVideo('A'));

    await act(async () => {
      answerVideo.now('B');
      await flushPromises();
      answerViews.now('A');
      await flushPromises();
    });

    await sendComment();
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ id: 'B', views: 0 }),
      }),
    );
  });
});
