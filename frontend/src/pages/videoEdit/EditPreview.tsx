import React, { useCallback, useEffect, useRef, useState } from 'react';
import Player from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { useTranslation } from 'react-i18next';
import {
  EditSegment,
  formatTime,
  nextJump,
  passageAt,
  passageStarts,
  toMontage,
  toSource,
  totalDuration,
  visibleTexts,
  wrapText,
} from './editorState';
import styles from './videoEdit.module.css';
const ReactPlayer = Player as unknown as React.FC<ReactPlayerProps>;

// A passage ends one frame early rather than showing a frame past its cut.
const END_TOLERANCE = 0.03;
// Further from the expected original time than this, the player is moved.
const DRIFT_TOLERANCE = 0.3;
// After a click on Play, the preview must have started within this delay.
export const START_TIMEOUT_MS = 8000;
// The editor's playhead follows playback at this pace; texts, every frame.
const REPORT_INTERVAL_MS = 100;

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
      state.current.onTime(montageTime);
    }
  }, []);

  const seekSource = (sourceTime: number) => {
    const v = video.current;
    if (!v) return;
    state.current.seeking = true;
    player.current?.seekTo(sourceTime, 'seconds');
  };

  const stop = (montageTime: number) => {
    setPlaying(false);
    report(montageTime, true);
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
    if (sourceTime >= passage.sourceEnd - END_TOLERANCE) {
      const jump = nextJump(list, s.index);
      if (jump.kind === 'end') return stop(s.duration);
      s.index = jump.index;
      if (jump.kind === 'seek') {
        seekSource(jump.sourceTime);
        report(passageStarts(list)[jump.index], true);
      } else report(toMontage(list, jump.index, sourceTime));
      return;
    }
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
  useEffect(() => {
    if (mode !== 'montage') return;
    const s = state.current;
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
    video.current = null;
    state.current.seeking = false;
    try {
      await onRetry?.();
    } finally {
      // A new player, on the address read again.
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
  const colors = { white: '#FFFFFF', black: '#000000', green: '#1DAC78' };
  const montage = mode === 'montage';
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
            key={attempt}
            ref={player}
            url={url}
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
            onPlay={() => setStarted(true)}
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
              if (montage) stop(duration);
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
              style={{
                color: colors[text.color],
                WebkitTextStroke: `0.5px ${text.color === 'black' ? 'white' : 'black'}`,
              }}
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
            if (montage) report(value, true);
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
