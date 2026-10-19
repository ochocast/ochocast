import { act, renderHook } from '@testing-library/react';
import { getMedia } from '../utils/api';
import { useMediaUrlRetry } from './useMediaUrlRetry';

jest.mock('../utils/api', () => ({ getMedia: jest.fn() }));

const mockedGetMedia = getMedia as jest.Mock;

const URL_OK = { ok: true, status: 200, data: 'https://cdn/v1/master.m3u8' };
const SERVER_ERROR = { ok: false, status: 502, data: { message: 'Bad' } };
const NETWORK_ERROR = { ok: false, status: null, data: null };

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flushPromises();
  });
};

/** Starts a load and records how it settles, without awaiting it. */
const startLoad = async (load: (id: string) => Promise<string | null>) => {
  const outcome: { settled: boolean; url?: string | null } = {
    settled: false,
  };
  await act(async () => {
    void load('v1').then((url) => {
      outcome.settled = true;
      outcome.url = url;
    });
    await flushPromises();
  });
  return outcome;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetMedia.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useMediaUrlRetry', () => {
  it('resolves with the signed URL of a ready video, without retrying', async () => {
    mockedGetMedia.mockResolvedValue(URL_OK);
    const { result } = renderHook(() => useMediaUrlRetry('v1'));

    const outcome = await startLoad(result.current.load);

    expect(outcome).toEqual({ settled: true, url: URL_OK.data });
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    expect(mockedGetMedia).toHaveBeenCalledWith('v1');
    expect(result.current.unavailable).toBe(false);
    await advance(30000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
  });

  it('retries server and network errors after 2 s, 5 s and 10 s, then gives up', async () => {
    mockedGetMedia
      .mockResolvedValueOnce(SERVER_ERROR)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(NETWORK_ERROR)
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const { result } = renderHook(() => useMediaUrlRetry('v1'));

    const outcome = await startLoad(result.current.load);
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);

    await advance(1999);
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockedGetMedia).toHaveBeenCalledTimes(2);

    await advance(4999);
    expect(mockedGetMedia).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(mockedGetMedia).toHaveBeenCalledTimes(3);

    await advance(9999);
    expect(mockedGetMedia).toHaveBeenCalledTimes(3);
    expect(outcome.settled).toBe(false);
    expect(result.current.unavailable).toBe(false);
    await advance(1);
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);

    expect(outcome).toEqual({ settled: true, url: null });
    expect(result.current.unavailable).toBe(true);
    await advance(60000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);
  });

  it('resolves as soon as a retry succeeds', async () => {
    mockedGetMedia
      .mockResolvedValueOnce(SERVER_ERROR)
      .mockResolvedValueOnce(URL_OK);
    const { result } = renderHook(() => useMediaUrlRetry('v1'));

    const outcome = await startLoad(result.current.load);
    await advance(2000);

    expect(outcome).toEqual({ settled: true, url: URL_OK.data });
    expect(result.current.unavailable).toBe(false);
    await advance(30000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(2);
  });

  it('starts over when the viewer retries after it gave up', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { result } = renderHook(() => useMediaUrlRetry('v1'));
    await startLoad(result.current.load);
    for (const delay of [2000, 5000, 10000]) await advance(delay);
    expect(result.current.unavailable).toBe(true);

    mockedGetMedia.mockReset();
    mockedGetMedia
      .mockResolvedValueOnce(NETWORK_ERROR)
      .mockResolvedValueOnce(URL_OK);
    const outcome = await startLoad(result.current.load);

    // Back to loading while the new tries run.
    expect(result.current.unavailable).toBe(false);
    await advance(2000);
    expect(outcome).toEqual({ settled: true, url: URL_OK.data });
    expect(mockedGetMedia).toHaveBeenCalledTimes(2);
  });

  it('drops pending tries when the viewer opens another video', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { result, rerender } = renderHook(({ id }) => useMediaUrlRetry(id), {
      initialProps: { id: 'v1' },
    });
    const outcome = await startLoad(result.current.load);

    rerender({ id: 'v2' });
    await advance(30000);

    expect(outcome).toEqual({ settled: true, url: null });
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe(false);
  });

  it('drops pending tries when the page unmounts', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { result, unmount } = renderHook(() => useMediaUrlRetry('v1'));
    const outcome = await startLoad(result.current.load);

    unmount();
    await advance(30000);

    expect(outcome).toEqual({ settled: true, url: null });
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
  });
  it('loadOnce starts no second series once a load ran for the video', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { result } = renderHook(() => useMediaUrlRetry('v1'));
    const first = await startLoad(result.current.load);
    await advance(2000);
    await advance(5000);
    await advance(10000);
    expect(first).toEqual({ settled: true, url: null });
    expect(result.current.unavailable).toBe(true);
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);

    // E.g. the page then marks the video ready without a URL.
    const again = await startLoad(result.current.loadOnce);

    expect(again).toEqual({ settled: true, url: null });
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);
    // The error and its Retry button stay on screen.
    expect(result.current.unavailable).toBe(true);
  });

  it('loadOnce loads a video no load ran for', async () => {
    mockedGetMedia.mockResolvedValue(URL_OK);
    const { result } = renderHook(() => useMediaUrlRetry('v1'));

    const outcome = await startLoad(result.current.loadOnce);

    expect(outcome).toEqual({ settled: true, url: URL_OK.data });
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
  });
});
