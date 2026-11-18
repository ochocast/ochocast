import React, { useEffect, useRef, useState } from 'react';
import Player from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { useTranslation } from 'react-i18next';
import {
  EditSegment,
  formatTime,
  locate,
  totalDuration,
  wrapText,
} from './editorState';
import styles from './videoEdit.module.css';
const ReactPlayer = Player as unknown as React.FC<ReactPlayerProps>;

export default function EditPreview({
  url,
  segments,
  time,
  onTime,
}: {
  url: string;
  segments: EditSegment[];
  time: number;
  onTime: (time: number) => void;
}) {
  const { t } = useTranslation();
  const player = useRef<Player>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = locate(segments, time);
  const duration = totalDuration(segments);
  const desired = current ? current.segment.sourceStart + current.offset : 0;
  const seek = () => {
    const actual = player.current?.getCurrentTime();
    if (typeof actual === 'number' && Math.abs(actual - desired) > 0.4)
      player.current?.seekTo(desired, 'seconds');
  };
  useEffect(() => {
    const actual = player.current?.getCurrentTime();
    if (typeof actual === 'number' && Math.abs(actual - desired) > 0.4)
      player.current?.seekTo(desired, 'seconds');
  }, [desired]);
  const colors = { white: '#FFFFFF', black: '#000000', green: '#1DAC78' };
  return (
    <div>
      <div className={styles.preview}>
        <ReactPlayer
          ref={player}
          url={url}
          width="100%"
          height="100%"
          playing={playing && !!current}
          onReady={() => {
            setFailed(false);
            seek();
          }}
          progressInterval={100}
          onError={(error: any) => {
            // A quick pause/seek may interrupt the play promise without a media failure.
            if (error?.name === 'AbortError') return;
            setFailed(true);
            setPlaying(false);
          }}
          onProgress={({ playedSeconds }) => {
            if (!playing || !current) return;
            const { segment, index, start } = current;
            // Ignore callbacks from the old source location while a seek settles.
            if (
              playedSeconds < segment.sourceStart - 0.3 ||
              playedSeconds > segment.sourceEnd + 1
            )
              return;
            if (playedSeconds >= segment.sourceEnd - 0.08) {
              if (index === segments.length - 1) {
                setPlaying(false);
                onTime(duration);
              } else {
                player.current?.seekTo(
                  segments[index + 1].sourceStart,
                  'seconds',
                );
                onTime(start + segment.sourceEnd - segment.sourceStart);
              }
            } else
              onTime(start + Math.max(0, playedSeconds - segment.sourceStart));
          }}
          onEnded={() => {
            setPlaying(false);
            onTime(duration);
          }}
        />
        {current?.segment.textLayers
          .filter(
            (text) =>
              current.offset >= text.startOffset &&
              current.offset < text.startOffset + text.duration,
          )
          .map((text) => (
            <div
              key={text.key}
              className={`${styles.overlay} ${styles[text.position]}`}
              style={{
                color: colors[text.color],
                WebkitTextStroke: `0.5px ${text.color === 'black' ? 'white' : 'black'}`,
              }}
            >
              {wrapText(text.content).join('\n')}
            </div>
          ))}
      </div>
      {failed && <p role="alert">{t('videoEdit.previewFailed')}</p>}
      <div className={styles.playback}>
        <button
          type="button"
          disabled={!current || failed}
          onClick={() => {
            if (time >= duration) onTime(0);
            setPlaying(!playing);
          }}
        >
          {t(playing ? 'videoEdit.pause' : 'videoEdit.play')}
        </button>
        <span>
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <input
          aria-label={t('videoEdit.playhead')}
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(time, duration)}
          onChange={(e) => onTime(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
