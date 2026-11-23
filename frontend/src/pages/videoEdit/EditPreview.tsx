import React, { useCallback, useEffect, useRef, useState } from 'react';
import Player from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { useTranslation } from 'react-i18next';
import {
  EditSegment,
  EditText,
  formatTime,
  nextJump,
  passageAt,
  passageStarts,
  roundHundredth,
  toMontage,
  toSource,
  totalDuration,
  visibleTexts,
  wrapText,
} from './editorState';
import styles from './videoEdit.module.css';
// disableDeferredLoading is passed on to the inner player but not typed.
const ReactPlayer = Player as unknown as React.FC<
  ReactPlayerProps & { disableDeferredLoading?: boolean }
>;

// react-player copies the props it does not know, disableDeferredLoading
// included, onto its wrapper: this one leaves it off the DOM element.
const PlayerWrapper = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { disableDeferredLoading?: boolean }
>(function PlayerWrapper({ disableDeferredLoading, ...attributes }, ref) {
  void disableDeferredLoading;
  return <div ref={ref} {...attributes} />;
});

// A passage ends one frame early rather than showing a frame past its cut.
const END_TOLERANCE = 0.03;
// Further from the expected original time than this, the player is moved.
const DRIFT_TOLERANCE = 0.3;
// After a click on Play, the preview must have started within this delay.
export const START_TIMEOUT_MS = 8000;
// The editor's playhead follows playback at this pace; texts, every frame.
const REPORT_INTERVAL_MS = 100;

/**
 * Colours of a text as the render draws them (render.service.ts COLORS):
 * the fill, and a 3 px outline on the 1280 px canvas, black around white
 * or green, white around black. The outline is a 6 px stroke whose inner
 * half is painted under the glyphs (paint-order in the stylesheet).
 */
export function previewTextStyle(color: EditText['color']) {
  const fill = { white: '#FFFFFF', black: '#000000', green: '#1DAC78' }[color];
  return {
    color: fill,
    WebkitTextStroke: `0.469cqw ${color === 'black' ? 'white' : 'black'}`,
  };
}

/**
 * The address the player loads on retry number `attempt`. A retry reloads
 * the same player (a new one would not do: in development, React's strict
 * mode unmounts it once, which aborts its first request for good), so the
 * address must change. The HLS playlist of our API is stable and unsigned:
 * a query parameter, ignored by the backend, makes it new (a #fragment would
 * hide its .m3u8 from react-player, which would skip hls.js). A presigned
 * source must not change, or its signature breaks; Retry reads it again,
 * freshly signed, hence already new.
 */
export function retryUrl(url: string, attempt: number): string {
  if (!attempt || !/\.m3u8($|\?)/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
}

type Mode = 'montage' | 'original';
type Status = 'loading' | 'ready' | 'stalled' | 'failed';

/**
 * Plays the montage being edited from the original, without any render:
 * passages in timeline order, a seek between passages that do not follow
 * each other in the original, the texts drawn over the video. A switch
 * plays the untouched original instead.
 */
export default function EditPreview({
  url,
  segments,
  time,
  onTime,
  sourceDuration,
  onRetry,
}: {
  url: string;
  segments: EditSegment[];
  time: number;
  onTime: (time: number) => void;
  sourceDuration: number;
  onRetry?: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const player = useRef<Player>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>('montage');
  // Montage time shown by the preview, refreshed every frame while playing.
  const [localTime, setLocalTime] = useState(time);
  const [originalTime, setOriginalTime] = useState(0);
  const duration = totalDuration(segments);

  // Read by the frame loop, which outlives renders.
  const state = useRef({
    segments,
    mode,
    index: 0,
    seeking: false,
    lastReport: 0,
    // Montage times this preview reported while playing: the editor sends
    // them back, sometimes after the player moved on; they are no request
    // to move it.
    reported: [] as number[],
    duration,
    onTime,
  });
  state.current.segments = segments;
  state.current.mode = mode;
  state.current.duration = duration;
  state.current.onTime = onTime;

  const report = useCallback((montageTime: number, force = false) => {
    setLocalTime(montageTime);
    const now = Date.now();
    if (force || now - state.current.lastReport >= REPORT_INTERVAL_MS) {
      state.current.lastReport = now;
      state.current.reported = [
        ...state.current.reported.slice(-4),
        montageTime,
      ];
      state.current.onTime(montageTime);
    }
  }, []);

  // A montage time chosen by the user: the player moves to it.
  const requestTime = (montageTime: number) => {
    setLocalTime(montageTime);
    state.current.reported = [];
    onTime(montageTime);
  };

  // Every jump of the preview lands on the 0.01 s grid of the editor.
  const seekSource = (sourceTime: number) => {
    const v = video.current;
    if (!v) return;
    state.current.seeking = true;
    player.current?.seekTo(roundHundredth(sourceTime), 'seconds');
  };

  const stop = (montageTime: number) => {
    setPlaying(false);
    report(montageTime, true);
  };

  // The current passage played to its end: the next one, or the end.
  const finishPassage = (sourceTime: number, resume: boolean) => {
    const s = state.current,
      list = s.segments;
    const jump = nextJump(list, s.index);
    if (jump.kind === 'end') return stop(s.duration);
    s.index = jump.index;
    // At the end of the original, even a joined passage needs a seek.
    if (jump.kind === 'seek' || resume) {
      seekSource(list[jump.index].sourceStart);
      report(passageStarts(list)[jump.index], true);
      // The original ended and paused: playback goes on.
      if (resume) video.current?.play().catch(() => undefined);
    } else report(toMontage(list, jump.index, sourceTime));
  };

  // One step of montage playback, at each frame.
  const step = () => {
    const v = video.current,
      s = state.current;
    if (!v || s.seeking) return;
    if (s.mode === 'original') {
      setOriginalTime(v.currentTime);
      return;
    }
    const list = s.segments;
    const passage = list[s.index];
    if (!passage) return;
    const sourceTime = v.currentTime;
    if (sourceTime >= passage.sourceEnd - END_TOLERANCE)
      return finishPassage(sourceTime, false);
    // Still before the passage (a seek that has not landed yet).
    if (sourceTime < passage.sourceStart - DRIFT_TOLERANCE) {
      seekSource(passage.sourceStart);
      return;
    }
    report(toMontage(list, s.index, sourceTime));
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // The frame loop runs while playing.
  useEffect(() => {
    const v = video.current;
    if (!playing || !v) return;
    let handle = 0,
      stopped = false;
    const useFrames = typeof v.requestVideoFrameCallback === 'function';
    const schedule = () => {
      if (stopped) return;
      handle = useFrames
        ? v.requestVideoFrameCallback(tick)
        : window.requestAnimationFrame(tick);
    };
    const tick = () => {
      stepRef.current();
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if (useFrames) v.cancelVideoFrameCallback(handle);
      else window.cancelAnimationFrame(handle);
    };
  }, [playing, attempt, status]);

  // A click on the timeline, a passage or the bar, and any edit of the
  // passages, move the montage time: the player follows it in the original.
  const shownSegments = useRef(segments);
  useEffect(() => {
    if (mode !== 'montage') return;
    const s = state.current;
    const edited = shownSegments.current !== segments;
    shownSegments.current = segments;
    // Playing, its own reports coming back never move the player.
    if (playing && !edited && s.reported.includes(time)) return;
    if (s.seeking) return;
    const at = toSource(segments, time);
    if (!at) return;
    s.index = at.index;
    // Paused, the preview shows exactly the requested time; playing, it
    // only follows a real move (the editor's playhead lags behind it).
    if (!playing || Math.abs(time - localTime) > DRIFT_TOLERANCE)
      setLocalTime(time);
    const v = video.current;
    if (v && Math.abs(v.currentTime - at.sourceTime) > DRIFT_TOLERANCE)
      seekSource(at.sourceTime);
    // localTime only follows here: playback updates it every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, time, mode, status, playing]);

  // Without a start within START_TIMEOUT_MS of a click on Play, say so.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!playing || started) return;
    const timer = window.setTimeout(() => {
      setPlaying(false);
      setStatus('stalled');
    }, START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [playing, started]);

  const attach = () => {
    const element = player.current?.getInternalPlayer();
    if (!(element instanceof HTMLVideoElement) || video.current === element)
      return;
    video.current = element;
    element.addEventListener('seeked', () => {
      state.current.seeking = false;
    });
    element.addEventListener('playing', () => setStarted(true));
  };

  const retry = async () => {
    setPlaying(false);
    setStarted(false);
    setStatus('loading');
    state.current.seeking = false;
    try {
      await onRetry?.();
    } finally {
      // The same player loads the address again (see retryUrl).
      setAttempt((n) => n + 1);
    }
  };

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    setStarted(false);
    if (mode === 'montage' && localTime >= duration - END_TOLERANCE) {
      // Played to the end: start again.
      state.current.index = 0;
      report(0, true);
      if (segments[0]) seekSource(segments[0].sourceStart);
    }
    setPlaying(true);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setPlaying(false);
    state.current.reported = [];
    if (next === 'original') {
      setOriginalTime(
        toSource(segments, localTime)?.sourceTime ??
          video.current?.currentTime ??
          0,
      );
    } else {
      // Back in the montage at the same picture when a passage shows it.
      const index = passageAt(segments, originalTime);
      if (index !== null)
        report(toMontage(segments, index, originalTime), true);
    }
    setMode(next);
  };

  const current = mode === 'montage' ? toSource(segments, localTime) : null;
  const passage = current ? segments[current.index] : undefined;
  const texts = passage && current ? visibleTexts(passage, current.offset) : [];
  const montage = mode === 'montage';
  const playerUrl = retryUrl(url, attempt);
  const shownTime = montage ? localTime : originalTime;
  const shownDuration = montage ? duration : sourceDuration;

  return (
    <div>
      <div className={styles.previewModes} role="group">
        {(['montage', 'original'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
          >
            {t(
              m === 'montage'
                ? 'videoEdit.modeMontage'
                : 'videoEdit.modeOriginal',
            )}
          </button>
        ))}
      </div>
      <div className={styles.preview}>
        {url && (
          <ReactPlayer
            ref={player}
            url={playerUrl}
            // Without it, react-player defers a new address until the first
            // one has loaded, which never happens after a failure: Retry
            // would wait forever.
            disableDeferredLoading
            wrapper={PlayerWrapper}
            width="100%"
            height="100%"
            playing={playing && status !== 'failed'}
            progressInterval={250}
            onReady={() => {
              attach();
              setStatus((previous) =>
                previous === 'failed' ? previous : 'ready',
              );
            }}
            onError={(error: { name?: string } | undefined) => {
              // A quick pause/seek may interrupt the play promise without a media failure.
              if (error?.name === 'AbortError') return;
              setPlaying(false);
              // Playback refused by the browser: it did not start, the media is fine.
              setStatus(
                error?.name === 'NotAllowedError' ? 'stalled' : 'failed',
              );
            }}
            onEnded={() => {
              // A passage may end with the original: the montage goes on.
              if (montage && video.current)
                finishPassage(video.current.currentTime, true);
              else setPlaying(false);
            }}
          />
        )}
        {montage &&
          texts.map((text) => (
            <div
              key={text.key}
              data-testid="preview-text"
              className={`${styles.overlay} ${styles[text.position]}`}
              style={previewTextStyle(text.color)}
            >
              {wrapText(text.content).join('\n')}
            </div>
          ))}
        {status === 'loading' && (
          <div className={styles.previewLoading} role="status">
            {t('videoEdit.previewLoading')}
          </div>
        )}
      </div>
      {(status === 'failed' || status === 'stalled') && (
        <div className={styles.previewProblem} role="alert">
          <p>
            {t(
              status === 'failed'
                ? 'videoEdit.previewFailed'
                : 'videoEdit.previewStalled',
            )}
          </p>
          <button type="button" onClick={retry}>
            {t('videoEdit.previewRetry')}
          </button>
        </div>
      )}
      <div className={styles.playback}>
        <button
          type="button"
          disabled={status === 'failed' || (montage && !segments.length)}
          onClick={togglePlay}
        >
          {t(playing ? 'videoEdit.pause' : 'videoEdit.play')}
        </button>
        <span>
          {formatTime(shownTime)} / {formatTime(shownDuration)}
        </span>
        <input
          aria-label={t(
            montage ? 'videoEdit.playhead' : 'videoEdit.originalPlayhead',
          )}
          type="range"
          min="0"
          max={shownDuration || 0}
          step="0.1"
          value={Math.min(shownTime, shownDuration)}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (montage) requestTime(value);
            else {
              setOriginalTime(value);
              seekSource(value);
            }
          }}
        />
      </div>
    </div>
  );
}
