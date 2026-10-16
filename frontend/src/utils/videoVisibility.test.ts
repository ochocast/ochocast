import { Video } from './VideoProperties';
import {
  filterListedVideos,
  filterReadyVideos,
  getStoredUserId,
  isVideoReady,
} from './videoVisibility';

const video = (
  id: string,
  transcoding_status: Video['transcoding_status'],
  creatorId = 'author',
): Video =>
  ({
    id,
    title: id,
    transcoding_status,
    creator: { id: creatorId },
  }) as unknown as Video;

describe('videoVisibility', () => {
  afterEach(() => localStorage.clear());

  it('treats videos without a status as ready (videos published before transcoding)', () => {
    expect(isVideoReady(video('legacy', undefined))).toBe(true);
    expect(isVideoReady(video('ok', 'ready'))).toBe(true);
    expect(isVideoReady(video('wip', 'pending'))).toBe(false);
    expect(isVideoReady(video('ko', 'failed'))).toBe(false);
  });

  it('keeps processing videos in lists but hides final failures from visitors', () => {
    const videos = [
      video('ready', 'ready'),
      video('pending', 'pending'),
      video('failed', 'failed'),
    ];

    expect(filterListedVideos(videos, null).map((v) => v.id)).toEqual([
      'ready',
      'pending',
    ]);
    expect(filterListedVideos(videos, 'someone-else').map((v) => v.id)).toEqual(
      ['ready', 'pending'],
    );
  });

  it('shows a failed video to its creator only', () => {
    const videos = [video('mine', 'failed', 'me'), video('theirs', 'failed')];

    expect(filterListedVideos(videos, 'me').map((v) => v.id)).toEqual(['mine']);
  });

  it('tolerates videos without a creator', () => {
    const orphan = { id: 'orphan', transcoding_status: 'failed' } as Video;

    expect(filterListedVideos([orphan], 'me')).toEqual([]);
  });

  it('keeps only playable videos for suggestions and the next video', () => {
    const videos = [
      video('pending', 'pending'),
      video('legacy', undefined),
      video('failed', 'failed', 'me'),
      video('ready', 'ready'),
    ];

    expect(filterReadyVideos(videos).map((v) => v.id)).toEqual([
      'legacy',
      'ready',
    ]);
  });

  it('reads the signed-in user id from local storage', () => {
    expect(getStoredUserId()).toBeNull();

    localStorage.setItem('backendUser', JSON.stringify({ id: 'me' }));
    expect(getStoredUserId()).toBe('me');

    localStorage.setItem('backendUser', '{not json');
    expect(getStoredUserId()).toBeNull();
  });
});
