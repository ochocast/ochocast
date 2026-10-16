import { act, renderHook } from '@testing-library/react';
import { getVideoProcessing } from '../utils/api';
import { useVideoProcessing } from './useVideoProcessing';

jest.mock('../utils/api', () => ({ getVideoProcessing: jest.fn() }));

const mockedGet = getVideoProcessing as jest.Mock;

const reply = (state: string, extra: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  data: { state, since: null, reason: null, playedFromSource: false, ...extra },
});

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const settle = () => act(flushPromises);

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flushPromises();
  });
};

let hidden = false;
const setHidden = async (value: boolean) => {
  hidden = value;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
  });
};

beforeAll(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  mockedGet.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useVideoProcessing', () => {
  it('checks right away, then backs off from 5 s up to 30 s', async () => {
    mockedGet.mockResolvedValue(reply('queued'));

    const { result } = renderHook(() =>
      useVideoProcessing('v1', { enabled: true }),
    );
    await settle();
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('v1');
    expect(result.current.status?.state).toBe('queued');

    await advance(4999);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    await advance(10000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
    await advance(20000);
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(29999);
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(mockedGet).toHaveBeenCalledTimes(5);
    await advance(30000);
    expect(mockedGet).toHaveBeenCalledTimes(6);
  });

  it('exposes stage changes and stops once the video is ready', async () => {
    const onFinal = jest.fn();
    mockedGet
      .mockResolvedValueOnce(reply('queued'))
      .mockResolvedValueOnce(
        reply('processing', { since: '2026-10-16T10:00:00.000Z' }),
      )
      .mockResolvedValueOnce(reply('ready'));

    const { result } = renderHook(() =>
      useVideoProcessing('v1', { enabled: true, onFinal }),
    );
    await settle();
    expect(result.current.status?.state).toBe('queued');

    await advance(5000);
    expect(result.current.status).toEqual({
      state: 'processing',
      since: '2026-10-16T10:00:00.000Z',
      reason: null,
      playedFromSource: false,
    });

    await advance(10000);
    expect(result.current.status?.state).toBe('ready');
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'ready' }),
      'v1',
    );

    await advance(120000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it('stops on a final failure and keeps its reason', async () => {
    const onFinal = jest.fn();
    mockedGet
      .mockResolvedValueOnce(reply('retrying'))
      .mockResolvedValueOnce(reply('failed', { reason: 'source_too_large' }));

    const { result } = renderHook(() =>
      useVideoProcessing('v1', { enabled: true, onFinal }),
    );
    await settle();
    expect(result.current.status?.state).toBe('retrying');

    await advance(5000);
    expect(result.current.status).toMatchObject({
      state: 'failed',
      reason: 'source_too_large',
    });
    expect(onFinal).toHaveBeenCalledTimes(1);

    await advance(120000);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('keeps trying after network or server errors', async () => {
    mockedGet
      .mockResolvedValueOnce({ ok: false, status: null, data: null })
      .mockResolvedValueOnce({ ok: false, status: 503, data: null })
      .mockResolvedValueOnce(reply('processing'));

    const { result } = renderHook(() =>
      useVideoProcessing('v1', { enabled: true }),
    );
    await settle();
    expect(result.current.status).toBeNull();

    await advance(5000);
    await advance(10000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
    expect(result.current.status?.state).toBe('processing');
  });

  it('gives up when the video no longer exists', async () => {
    mockedGet.mockResolvedValue({ ok: false, status: 404, data: {} });

    renderHook(() => useVideoProcessing('v1', { enabled: true }));
    await settle();
    await advance(120000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('pauses while the tab is hidden and checks again as soon as it is visible', async () => {
    mockedGet.mockResolvedValue(reply('processing'));

    renderHook(() => useVideoProcessing('v1', { enabled: true }));
    await settle();
    expect(mockedGet).toHaveBeenCalledTimes(1);

    await setHidden(true);
    await advance(300000);
    expect(mockedGet).toHaveBeenCalledTimes(1);

    await setHidden(false);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    await advance(10000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it('waits for the tab to be visible before the first check', async () => {
    hidden = true;
    mockedGet.mockResolvedValue(reply('queued'));

    renderHook(() => useVideoProcessing('v1', { enabled: true }));
    await settle();
    await advance(60000);
    expect(mockedGet).not.toHaveBeenCalled();

    await setHidden(false);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled or without a video id', async () => {
    mockedGet.mockResolvedValue(reply('queued'));

    renderHook(() => useVideoProcessing('v1', { enabled: false }));
    renderHook(() => useVideoProcessing(undefined, { enabled: true }));
    await settle();
    await advance(60000);

    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('stops polling on unmount', async () => {
    mockedGet.mockResolvedValue(reply('queued'));

    const { unmount } = renderHook(() =>
      useVideoProcessing('v1', { enabled: true }),
    );
    await settle();
    unmount();
    await advance(120000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('forgets the previous video status when navigating to another video', async () => {
    mockedGet.mockResolvedValueOnce(reply('processing'));

    const { result, rerender } = renderHook(
      ({ id }) => useVideoProcessing(id, { enabled: true }),
      { initialProps: { id: 'v1' } },
    );
    await settle();
    expect(result.current.status?.state).toBe('processing');

    mockedGet.mockReturnValueOnce(new Promise(() => {}));
    rerender({ id: 'v2' });
    expect(result.current.status).toBeNull();
    await settle();
    expect(mockedGet).toHaveBeenLastCalledWith('v2');
  });
});
