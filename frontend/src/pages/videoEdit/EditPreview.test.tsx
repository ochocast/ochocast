import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EditPreview, {
  previewTextStyle,
  retryUrl,
  START_TIMEOUT_MS,
} from './EditPreview';
import { EditSegment, EditText } from './editorState';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// A fake player around a real <video>: the test moves its time, lands its
// seeks and runs its frame callbacks.
const mockPlayer: {
  video: HTMLVideoElement;
  props: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  seeks: number[];
  frames: Array<() => void>;
  mounts: number;
} = {
  video: document.createElement('video'),
  props: {},
  seeks: [],
  frames: [],
  mounts: 0,
};
jest.mock('react-player/lazy', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: React.forwardRef(
      (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
        mockPlayer.props = props;
        React.useEffect(() => {
          mockPlayer.mounts += 1;
        }, []);
        React.useImperativeHandle(ref, () => ({
          getInternalPlayer: () => mockPlayer.video,
          seekTo: (seconds: number) => {
            mockPlayer.seeks.push(seconds);
            mockPlayer.video.currentTime = seconds;
          },
        }));
        return null;
      },
    ),
  };
});

const newVideo = () => {
  const video = document.createElement('video');
  let now = 0;
  Object.defineProperty(video, 'currentTime', {
    get: () => now,
    set: (value: number) => {
      now = value;
    },
  });
  Object.assign(video, {
    requestVideoFrameCallback: (callback: () => void) =>
      mockPlayer.frames.push(callback),
    cancelVideoFrameCallback: () => {
      mockPlayer.frames = [];
    },
  });
  return video;
};

const passage = (
  sourceStart: number,
  sourceEnd: number,
  textLayers: EditText[] = [],
): EditSegment => ({
  key: `p-${sourceStart}-${sourceEnd}`,
  sourceStart,
  sourceEnd,
  textLayers,
});
const text = (
  content: string,
  startOffset: number,
  duration: number,
  position: EditText['position'] = 'bottom',
  color: EditText['color'] = 'white',
): EditText => ({
  key: content,
  content,
  position,
  color,
  startOffset,
  duration,
});

// Reordered: original 20-30 s, then 0-5 s, then 5-12 s which joins it.
const reordered = () => [passage(20, 30), passage(0, 5), passage(5, 12)];

const onRetry = jest.fn();
const reported: number[] = [];
let setList: (segments: EditSegment[]) => void = () => undefined;

/** The editor around the preview: it keeps the montage time it reports. */
function Editor({ initial }: { initial: EditSegment[] }) {
  const [segments, setSegments] = useState(initial);
  const [time, setTime] = useState(0);
  setList = (next) => {
    setSegments(next);
    // Like the editor: the playhead stays within the new montage.
    setTime((t) =>
      Math.min(
        t,
        next.reduce((n, s) => n + s.sourceEnd - s.sourceStart, 0),
      ),
    );
  };
  return (
    <EditPreview
      url="original.m3u8"
      segments={segments}
      time={time}
      onTime={(t) => {
        reported.push(t);
        setTime(t);
      }}
      sourceDuration={40}
      onRetry={onRetry}
    />
  );
}

let showStale: (time: number) => void = () => undefined;

/** An editor that shows the preview's reports only when the test says so. */
function StaleEditor({ initial }: { initial: EditSegment[] }) {
  const [time, setTime] = useState(0);
  showStale = setTime;
  return (
    <EditPreview
      url="original.m3u8"
      segments={initial}
      time={time}
      onTime={(t) => {
        reported.push(t);
        // A user move shows at once; playback reports wait.
        if (!Number.isInteger(t) || t === 12) setTime(t);
      }}
      sourceDuration={40}
      onRetry={onRetry}
    />
  );
}

const ready = () => act(() => mockPlayer.props.onReady());
const landSeek = () =>
  act(() => {
    mockPlayer.video.dispatchEvent(new Event('seeked'));
  });
const started = () =>
  act(() => {
    mockPlayer.video.dispatchEvent(new Event('playing'));
  });
/** The player shows the frame at `sourceTime`. */
const frame = (sourceTime: number) =>
  act(() => {
    mockPlayer.video.currentTime = sourceTime;
    const callbacks = mockPlayer.frames;
    mockPlayer.frames = [];
    callbacks.forEach((callback) => callback());
  });
const clock = () => screen.getByText(/ \/ /).textContent;
const playButton = () => screen.getByText(/^videoEdit\.(play|pause)$/);
const texts = () =>
  screen.queryAllByTestId('preview-text').map((t) => t.textContent);

/** Loaded, positioned on the first passage, playing. */
const startPlaying = async (segments: EditSegment[]) => {
  render(<Editor initial={segments} />);
  ready();
  landSeek();
  fireEvent.click(playButton());
  started();
};

beforeEach(() => {
  mockPlayer.video = newVideo();
  mockPlayer.props = {};
  mockPlayer.seeks = [];
  mockPlayer.frames = [];
  mockPlayer.mounts = 0;
  reported.length = 0;
  onRetry.mockReset();
});

it('plays the passages in timeline order with the montage time and duration', async () => {
  await startPlaying(reordered());
  // Positioned on the first passage once the player is ready.
  expect(mockPlayer.seeks).toEqual([20]);
  expect(clock()).toBe('00:00 / 00:22');

  frame(25);
  expect(clock()).toBe('00:05 / 00:22');
  // End of the first passage: a seek to the next one, elsewhere.
  frame(29.98);
  expect(mockPlayer.seeks).toEqual([20, 0]);
  expect(clock()).toBe('00:10 / 00:22');
  // Frames from the old location are ignored while the seek lands.
  frame(30.1);
  expect(clock()).toBe('00:10 / 00:22');
  landSeek();
  frame(2);
  expect(clock()).toBe('00:12 / 00:22');
  // The third passage follows the second in the original: no seek.
  frame(4.99);
  frame(6);
  expect(mockPlayer.seeks).toEqual([20, 0]);
  expect(clock()).toBe('00:16 / 00:22');
  expect(playButton()).toHaveTextContent('videoEdit.pause');
});

it('stops cleanly at the end of the last passage, then plays again from the start', async () => {
  await startPlaying(reordered());
  frame(29.98);
  landSeek();
  frame(4.99);
  frame(11.98);
  expect(playButton()).toHaveTextContent('videoEdit.play');
  expect(clock()).toBe('00:22 / 00:22');
  expect(reported[reported.length - 1]).toBe(22);
  expect(mockPlayer.props.playing).toBe(false);

  fireEvent.click(playButton());
  expect(mockPlayer.seeks[mockPlayer.seeks.length - 1]).toBe(20);
  expect(clock()).toBe('00:00 / 00:22');
});

it('plays a 5 s passage and a passage ending with the original', async () => {
  await startPlaying([passage(0, 5), passage(35, 40)]);
  // Already at the start of the first passage: no seek.
  expect(mockPlayer.seeks).toEqual([]);
  frame(4.98);
  expect(mockPlayer.seeks).toEqual([35]);
  landSeek();
  frame(37);
  expect(clock()).toBe('00:07 / 00:10');
  // The original ends with the montage.
  act(() => mockPlayer.props.onEnded());
  expect(clock()).toBe('00:10 / 00:10');
  expect(playButton()).toHaveTextContent('videoEdit.play');
});

it('follows a removed passage without stopping', async () => {
  await startPlaying(reordered());
  frame(25);
  // The first passage is removed: montage time 5 now plays the original at 5.
  act(() => setList(reordered().slice(1)));
  expect(mockPlayer.seeks).toEqual([20, 5]);
  landSeek();
  frame(6);
  expect(clock()).toBe('00:06 / 00:12');
  expect(playButton()).toHaveTextContent('videoEdit.pause');
});

it('moves the player when the playhead is moved, paused or not', async () => {
  render(<Editor initial={reordered()} />);
  ready();
  landSeek();
  fireEvent.change(screen.getByLabelText('videoEdit.playhead'), {
    target: { value: '13' },
  });
  // Montage 13 s is 3 s into the second passage: the original at 3 s.
  expect(mockPlayer.seeks).toEqual([20, 3]);
  expect(clock()).toBe('00:13 / 00:22');
});

it('shows texts during their interval, bounds included, where and how the render draws them', async () => {
  await startPlaying([
    passage(0, 5, [text('Début', 0, 2, 'top', 'green')]),
    passage(10, 15, [text('Fin', 3, 2, 'center', 'black')]),
  ]);
  // A text that starts the passage shows on its first frame.
  expect(texts()).toEqual(['Début']);
  const shown = screen.getByTestId('preview-text');
  expect(shown.className).toContain('top');
  expect(shown).toHaveStyle({ color: '#1DAC78' });
  frame(2);
  expect(texts()).toEqual(['Début']);
  frame(2.5);
  expect(texts()).toEqual([]);
  frame(4.98);
  landSeek();
  frame(12.9);
  expect(texts()).toEqual([]);
  // A text that ends the passage shows up to its last frame.
  frame(14.96);
  expect(texts()).toEqual(['Fin']);
  expect(screen.getByTestId('preview-text').className).toContain('center');
});

it('updates the texts as soon as they are edited, without saving', async () => {
  render(<Editor initial={[passage(0, 10)]} />);
  ready();
  landSeek();
  expect(texts()).toEqual([]);
  act(() => setList([passage(0, 10, [text('Ajouté', 0, 3)])]));
  expect(texts()).toEqual(['Ajouté']);
});

it('switches to the untouched original and back at the same picture', async () => {
  await startPlaying(reordered());
  frame(25);
  fireEvent.click(screen.getByText('videoEdit.modeOriginal'));
  // Paused, on the same picture: original 25 s of 40 s.
  expect(playButton()).toHaveTextContent('videoEdit.play');
  expect(clock()).toBe('00:25 / 00:40');
  fireEvent.click(playButton());
  started();
  frame(31);
  // Plays on past the cut: no passage logic in the original.
  expect(clock()).toBe('00:31 / 00:40');
  expect(mockPlayer.seeks).toEqual([20]);
  fireEvent.change(screen.getByLabelText('videoEdit.originalPlayhead'), {
    target: { value: '3' },
  });
  expect(mockPlayer.seeks).toEqual([20, 3]);
  landSeek();
  // Original 3 s is shown by the second passage, at montage 13 s.
  fireEvent.click(screen.getByText('videoEdit.modeMontage'));
  expect(clock()).toBe('00:13 / 00:22');
});

it('hides the montage texts in the original', async () => {
  await startPlaying([passage(0, 10, [text('Titre', 0, 10)])]);
  expect(texts()).toEqual(['Titre']);
  fireEvent.click(screen.getByText('videoEdit.modeOriginal'));
  expect(texts()).toEqual([]);
});

it('shows a loader until the player is ready', () => {
  render(<Editor initial={reordered()} />);
  expect(screen.getByRole('status')).toHaveTextContent(
    'videoEdit.previewLoading',
  );
  ready();
  expect(screen.queryByRole('status')).toBeNull();
});

it('offers a retry when the original cannot be played, reloading the same player', async () => {
  let resolveRetry: () => void = () => undefined;
  onRetry.mockImplementation(
    () => new Promise<void>((resolve) => (resolveRetry = resolve)),
  );
  render(<Editor initial={reordered()} />);
  ready();
  act(() => mockPlayer.props.onError({ name: 'MediaError' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'videoEdit.previewFailed',
  );
  expect(playButton()).toBeDisabled();

  fireEvent.click(screen.getByText('videoEdit.previewRetry'));
  // The original's address is read again, then the same player reloads it
  // (a new player would lose its first request to React's strict mode).
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(mockPlayer.props.url).toBe('original.m3u8');
  await act(async () => resolveRetry());
  expect(mockPlayer.props.url).toBe('original.m3u8?retry=1');
  // react-player would otherwise wait for the failed address to load first.
  expect(mockPlayer.props.disableDeferredLoading).toBe(true);
  expect(mockPlayer.mounts).toBe(1);
  ready();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(playButton()).toBeEnabled();
  // A second retry makes the address new again.
  act(() => mockPlayer.props.onError({ name: 'MediaError' }));
  fireEvent.click(screen.getByText('videoEdit.previewRetry'));
  await act(async () => resolveRetry());
  expect(mockPlayer.props.url).toBe('original.m3u8?retry=2');
});

// Seen in the browser: a passage ending with the original made the player
// fire "ended", which stopped the montage before its last passages.
it('goes on with the next passage when a passage ends with the original', async () => {
  const play = jest.fn().mockResolvedValue(undefined);
  await startPlaying([passage(0, 5), passage(35, 40), passage(10, 15)]);
  mockPlayer.video.play = play;
  frame(4.98);
  landSeek();
  frame(39.96);
  // The original ends before the last frame of the passage reaches the loop.
  act(() => mockPlayer.props.onEnded());
  expect(mockPlayer.seeks).toEqual([35, 10]);
  expect(play).toHaveBeenCalledTimes(1);
  expect(clock()).toBe('00:10 / 00:15');
  expect(playButton()).toHaveTextContent('videoEdit.pause');
  landSeek();
  frame(12);
  expect(clock()).toBe('00:12 / 00:15');
  // The original ending with the last passage still ends the montage.
  frame(14.98);
  expect(playButton()).toHaveTextContent('videoEdit.play');
});

// Seen in the browser: the editor sent back a montage time this preview had
// reported before a slow render, and the player jumped back to it.
it('never moves the player back to a time it reported itself while playing', async () => {
  let now = 1_000_000;
  const clockSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    render(<StaleEditor initial={reordered()} />);
    ready();
    landSeek();
    fireEvent.click(playButton());
    started();
    for (const at of [21, 22, 23]) {
      now += 200;
      frame(at);
    }
    // The editor shows the first of these reports only now.
    act(() => showStale(1));
    expect(mockPlayer.seeks).toEqual([20]);
    expect(clock()).toBe('00:03 / 00:22');
    // A real request from the user still moves it, even while playing.
    fireEvent.change(screen.getByLabelText('videoEdit.playhead'), {
      target: { value: '12' },
    });
    expect(mockPlayer.seeks).toEqual([20, 2]);
  } finally {
    clockSpy.mockRestore();
  }
});

it('ignores an interrupted play request', () => {
  render(<Editor initial={reordered()} />);
  ready();
  act(() => mockPlayer.props.onError({ name: 'AbortError' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

describe('a preview that does not start', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says so a few seconds after Play, then retries', () => {
    render(<Editor initial={reordered()} />);
    // Never ready: Play stays possible, and nothing happens.
    fireEvent.click(playButton());
    act(() => {
      jest.advanceTimersByTime(START_TIMEOUT_MS - 1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'videoEdit.previewStalled',
    );
    expect(playButton()).toHaveTextContent('videoEdit.play');
    expect(screen.getByText('videoEdit.previewRetry')).toBeInTheDocument();
  });

  it('waits for pictures, not for the play request, to call it started', () => {
    render(<Editor initial={reordered()} />);
    ready();
    fireEvent.click(playButton());
    // The play request alone (react-player's onPlay) is not a start.
    act(() => mockPlayer.props.onPlay?.());
    act(() => {
      jest.advanceTimersByTime(START_TIMEOUT_MS);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'videoEdit.previewStalled',
    );
  });

  it('does not complain once playback started', () => {
    render(<Editor initial={reordered()} />);
    ready();
    fireEvent.click(playButton());
    started();
    act(() => {
      jest.advanceTimersByTime(START_TIMEOUT_MS * 2);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats playback refused by the browser as not started', () => {
    render(<Editor initial={reordered()} />);
    ready();
    fireEvent.click(playButton());
    act(() => mockPlayer.props.onError({ name: 'NotAllowedError' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'videoEdit.previewStalled',
    );
    expect(playButton()).toBeEnabled();
  });
});

// jsdom drops -webkit-text-stroke: the style is checked on its own.
it.each([
  ['white', '#FFFFFF', 'black'],
  ['green', '#1DAC78', 'black'],
  ['black', '#000000', 'white'],
] as const)('draws a %s text like the render', (color, fill, outline) => {
  expect(previewTextStyle(color)).toEqual({
    color: fill,
    // 3 px of a 1280 px canvas on each side: a 6 px stroke, half under the text.
    WebkitTextStroke: `0.469cqw ${outline}`,
  });
});

it('makes the address of a retry new without breaking it', () => {
  const hls = 'http://api/videos/media-content/v/master.m3u8';
  expect(retryUrl(hls, 0)).toBe(hls);
  // Still an .m3u8 for react-player, which then uses hls.js.
  expect(retryUrl(hls, 2)).toBe(`${hls}?retry=2`);
  expect(retryUrl(`${hls}?a=1`, 1)).toBe(`${hls}?a=1&retry=1`);
  // A presigned source keeps its signature: Retry reads it again instead.
  const signed =
    'https://bucket/v/source/original.mp4?X-Amz-Signature=abc&X-Amz-Expires=60';
  expect(retryUrl(signed, 3)).toBe(signed);
});
