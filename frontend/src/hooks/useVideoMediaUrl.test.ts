import { act, renderHook } from '@testing-library/react';
import { getMedia } from '../utils/api';
import { useVideoMediaUrl } from './useVideoMediaUrl';

jest.mock('../utils/api', () => ({ getMedia: jest.fn() }));

const mockedGetMedia = getMedia as jest.Mock;

const URL_V1 = { ok: true, status: 200, data: 'https://cdn/v1/master.m3u8' };
const URL_V2 = { ok: true, status: 200, data: 'https://cdn/v2/master.m3u8' };
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

type Props = { id: string | undefined; ready: boolean };
const render = (initialProps: Props) =>
  renderHook(({ id, ready }: Props) => useVideoMediaUrl(id, ready), {
    initialProps,
  });
const settle = () => act(flushPromises);

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetMedia.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useVideoMediaUrl', () => {
  it('loads the URL of a ready video at once, without retrying', async () => {
    mockedGetMedia.mockResolvedValue(URL_V1);
    const { result } = render({ id: 'v1', ready: true });
    await settle();

    expect(result.current).toMatchObject({
      url: URL_V1.data,
      unavailable: false,
    });
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    expect(mockedGetMedia).toHaveBeenCalledWith('v1');
    await advance(30000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing while the video is processing, then loads once it is ready', async () => {
    mockedGetMedia.mockResolvedValue(URL_V1);
    const { result, rerender } = render({ id: 'v1', ready: false });
    await settle();
    expect(mockedGetMedia).not.toHaveBeenCalled();
    expect(result.current.url).toBeNull();

    rerender({ id: 'v1', ready: true });
    await settle();

    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    expect(result.current.url).toBe(URL_V1.data);
  });

  it('retries server and network errors after 2 s, 5 s and 10 s, then gives up', async () => {
    mockedGetMedia
      .mockResolvedValueOnce(SERVER_ERROR)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(NETWORK_ERROR)
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const { result } = render({ id: 'v1', ready: true });
    await settle();
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);

    await advance(1999);
    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockedGetMedia).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(3);
    expect(result.current.unavailable).toBe(false);
    await advance(10000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);

    expect(result.current).toMatchObject({ url: null, unavailable: true });
    await advance(60000);
    expect(mockedGetMedia).toHaveBeenCalledTimes(4);
  });

  it('shows the URL as soon as a retry succeeds', async () => {
    mockedGetMedia
      .mockResolvedValueOnce(SERVER_ERROR)
      .mockResolvedValueOnce(URL_V1);
    const { result } = render({ id: 'v1', ready: true });
    await settle();
    await advance(2000);

    expect(result.current).toMatchObject({
      url: URL_V1.data,
      unavailable: false,
    });
  });

  it('starts over when the viewer retries after it gave up', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { result } = render({ id: 'v1', ready: true });
    await settle();
    await advance(2000);
    await advance(5000);
    await advance(10000);
    expect(result.current.unavailable).toBe(true);

    mockedGetMedia.mockResolvedValue(URL_V1);
    act(() => result.current.retry());
    await settle();

    expect(result.current).toMatchObject({
      url: URL_V1.data,
      unavailable: false,
    });
    expect(mockedGetMedia).toHaveBeenCalledTimes(5);
  });

  // VideoMedia stays mounted across /video/:videoId.
  it('never shows a load of the previous video on the next one', async () => {
    let answerV1: (value: unknown) => void = () => undefined;
    mockedGetMedia.mockImplementation((id: string) =>
      id === 'v1'
        ? new Promise((resolve) => {
            answerV1 = resolve;
          })
        : Promise.resolve(URL_V2),
    );
    const { result, rerender } = render({ id: 'v1', ready: true });
    await settle();

    // The page moves to v2 while v1's request is still running, and v2's
    // own data is not loaded yet.
    rerender({ id: 'v2', ready: false });
    await act(async () => {
      answerV1(URL_V1);
      await flushPromises();
    });
    expect(result.current).toMatchObject({ url: null, unavailable: false });

    rerender({ id: 'v2', ready: true });
    await settle();
    expect(result.current.url).toBe(URL_V2.data);
  });

  it('loads a video again when the viewer comes back to it', async () => {
    mockedGetMedia.mockImplementation(async (id: string) =>
      id === 'v1' ? URL_V1 : URL_V2,
    );
    const { result, rerender } = render({ id: 'v1', ready: true });
    await settle();
    rerender({ id: 'v2', ready: true });
    await settle();
    rerender({ id: 'v1', ready: true });
    await settle();

    expect(result.current.url).toBe(URL_V1.data);
    expect(mockedGetMedia).toHaveBeenCalledTimes(3);
  });

  it('drops pending tries when the page unmounts', async () => {
    mockedGetMedia.mockResolvedValue(SERVER_ERROR);
    const { unmount } = render({ id: 'v1', ready: true });
    await settle();
    unmount();
    await advance(20000);

    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
  });

  // A new URL would reload the player from the start, mid-playback; the
  // playlist was resolved when the video was opened.
  it('keeps the URL of a video that stays on screen, without asking again', async () => {
    mockedGetMedia.mockResolvedValue(URL_V1);
    const { result } = render({ id: 'v1', ready: true });
    await settle();

    await advance(2 * 60 * 60 * 1000);

    expect(mockedGetMedia).toHaveBeenCalledTimes(1);
    expect(result.current.url).toBe(URL_V1.data);
  });
});
