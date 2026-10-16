import { getVideoProcessing } from './api';
import {
  fetchVideoProcessing,
  isFinalProcessingState,
  nextPollDelay,
  parseVideoProcessing,
  processingFailureCopy,
  videoPlayerView,
} from './videoProcessing';
import { VideoProcessing } from './VideoProperties';

jest.mock('./api', () => ({ getVideoProcessing: jest.fn() }));

const mockedGet = getVideoProcessing as jest.Mock;

describe('nextPollDelay', () => {
  it('starts at 5 s and doubles up to 30 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(nextPollDelay)).toEqual([
      5000, 10000, 20000, 30000, 30000, 30000,
    ]);
  });
});

describe('isFinalProcessingState', () => {
  it('stops polling only on ready and failed', () => {
    expect(isFinalProcessingState('ready')).toBe(true);
    expect(isFinalProcessingState('failed')).toBe(true);
    expect(isFinalProcessingState('queued')).toBe(false);
    expect(isFinalProcessingState('processing')).toBe(false);
    expect(isFinalProcessingState('retrying')).toBe(false);
  });
});

describe('parseVideoProcessing', () => {
  it('accepts the API contract', () => {
    expect(
      parseVideoProcessing({
        state: 'failed',
        since: null,
        reason: 'invalid_source',
        playedFromSource: false,
      }),
    ).toEqual({
      state: 'failed',
      since: null,
      reason: 'invalid_source',
      playedFromSource: false,
    });
  });

  it('fills optional fields with safe defaults', () => {
    expect(parseVideoProcessing({ state: 'processing' })).toEqual({
      state: 'processing',
      since: null,
      reason: null,
      playedFromSource: false,
    });
  });

  it('rejects bodies that are not a processing status', () => {
    expect(parseVideoProcessing(undefined)).toBeNull();
    expect(parseVideoProcessing('ready')).toBeNull();
    expect(parseVideoProcessing({ state: 'done' })).toBeNull();
    expect(parseVideoProcessing({ message: 'Not Found' })).toBeNull();
  });
});

describe('fetchVideoProcessing', () => {
  afterEach(() => mockedGet.mockReset());

  it('returns the status of an existing video', async () => {
    mockedGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { state: 'queued', since: '2026-10-16T10:00:00.000Z' },
    });

    await expect(fetchVideoProcessing('v1')).resolves.toEqual({
      kind: 'status',
      status: {
        state: 'queued',
        since: '2026-10-16T10:00:00.000Z',
        reason: null,
        playedFromSource: false,
      },
    });
    expect(mockedGet).toHaveBeenCalledWith('v1');
  });

  it('reports a missing or archived video', async () => {
    mockedGet.mockResolvedValue({ ok: false, status: 404, data: {} });

    await expect(fetchVideoProcessing('v1')).resolves.toEqual({
      kind: 'not_found',
    });
  });

  it('reports network errors, server errors and malformed bodies as retryable', async () => {
    mockedGet.mockResolvedValueOnce({ ok: false, status: null, data: null });
    mockedGet.mockResolvedValueOnce({ ok: false, status: 502, data: null });
    mockedGet.mockResolvedValueOnce({ ok: true, status: 200, data: '<html>' });
    mockedGet.mockRejectedValueOnce(new Error('boom'));

    for (let i = 0; i < 4; i++)
      await expect(fetchVideoProcessing('v1')).resolves.toEqual({
        kind: 'error',
      });
  });
});

describe('processingFailureCopy', () => {
  it('explains each final failure reason in plain language', () => {
    expect(processingFailureCopy('invalid_source')).toEqual({
      reason: 'processingFailureInvalidSource',
      advice: 'processingFailureInvalidSourceAdvice',
    });
    expect(processingFailureCopy('source_too_large')).toEqual({
      reason: 'processingFailureTooLarge',
      advice: 'processingFailureTooLargeAdvice',
    });
    expect(processingFailureCopy('duration_exceeded')).toEqual({
      reason: 'processingFailureNotPlayable',
      advice: 'processingFailureNotPlayableAdvice',
    });
    expect(processingFailureCopy('deadline_exceeded')).toEqual(
      processingFailureCopy('duration_exceeded'),
    );
  });

  it('falls back to a temporary problem for max_attempts, unknown and unexpected codes', () => {
    const temporary = {
      reason: 'processingFailureTemporary',
      advice: 'processingFailureTemporaryAdvice',
    };
    expect(processingFailureCopy('max_attempts')).toEqual(temporary);
    expect(processingFailureCopy('unknown')).toEqual(temporary);
    expect(processingFailureCopy(null)).toEqual(temporary);
    expect(processingFailureCopy('ffmpeg exited with code 1')).toEqual(
      temporary,
    );
  });
});

describe('videoPlayerView', () => {
  const known = (state: VideoProcessing['state']): VideoProcessing => ({
    state,
    since: null,
    reason: null,
    playedFromSource: false,
  });

  it('trusts the known processing state over a stale video status', () => {
    // The video was loaded as failed, the processing endpoint knows better.
    expect(videoPlayerView('failed', known('queued'))).toBe('processing');
    expect(videoPlayerView('failed', known('processing'))).toBe('processing');
    expect(videoPlayerView('failed', known('retrying'))).toBe('processing');
    expect(videoPlayerView('failed', known('ready'))).toBe('player');
    expect(videoPlayerView('pending', known('ready'))).toBe('player');
    expect(videoPlayerView('ready', known('failed'))).toBe('failed');
    expect(videoPlayerView('pending', known('failed'))).toBe('failed');
  });

  it('falls back to the video status while the processing state is unknown', () => {
    expect(videoPlayerView('failed', null)).toBe('failed');
    expect(videoPlayerView('pending', null)).toBe('processing');
    expect(videoPlayerView('ready', null)).toBe('player');
    // Videos created before transcoding statuses existed.
    expect(videoPlayerView(undefined, null)).toBe('player');
  });
});
