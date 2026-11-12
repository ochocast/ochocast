import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { clusterMarkers } from './clusterMarkers';
import styles from './PassageStrip.module.css';

export interface StripPassage {
  start: number;
  excerpt: string;
}

interface PassageStripProps {
  duration: number | null;
  passages: StripPassage[];
  currentTime: number;
  isTouch: boolean;
  onSeek: (seconds: number) => void;
}

const MIN_GAP_TOUCH_PX = 44;
const MIN_GAP_POINTER_PX = 12;

const clampFraction = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Thin strip under the player: one clickable marker per passage found,
 * a playback cursor and the current passage highlighted. Markers sit on an
 * inner track inset by half the hit width, so that the buttons of the
 * markers at 0 % and 100 % stay inside the strip.
 */
const PassageStrip: React.FC<PassageStripProps> = ({
  duration,
  passages,
  currentTime,
  isTouch,
  onSeek,
}) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);

  const hasDuration =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  const visible = hasDuration && passages.length > 0;

  useEffect(() => {
    const track = trackRef.current;
    if (!visible || !track) {
      return undefined;
    }
    setTrackWidth(track.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const width =
        entries[entries.length - 1]?.contentRect?.width ??
        track.getBoundingClientRect().width;
      setTrackWidth(width);
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [visible]);

  const sortedPassages = useMemo(
    () => [...passages].sort((a, b) => a.start - b.start),
    [passages],
  );

  const clusters = useMemo(
    () =>
      clusterMarkers(
        sortedPassages.map((p) => p.start),
        duration ?? 0,
        trackWidth,
        isTouch ? MIN_GAP_TOUCH_PX : MIN_GAP_POINTER_PX,
      ),
    [sortedPassages, duration, trackWidth, isTouch],
  );

  if (!visible) {
    return null;
  }

  // The current marker is the last one starting at or before the playback
  // position; none before the first passage.
  let currentIndex = -1;
  clusters.forEach((cluster, index) => {
    if (cluster.start <= currentTime) {
      currentIndex = index;
    }
  });

  const cursorPct = clampFraction(currentTime / (duration as number)) * 100;

  return (
    <div
      className={`${styles.strip} ${isTouch ? styles.touch : styles.pointer}`}
      role="group"
      aria-label={t('passageStrip.region')}
    >
      <div className={styles.track} ref={trackRef}>
        <div className={styles.baseline} aria-hidden="true" />
        <div
          className={styles.cursor}
          style={{ left: `${cursorPct}%` }}
          data-testid="passage-cursor"
          aria-hidden="true"
        />
        {clusters.map((cluster, index) => {
          const first = sortedPassages.find((p) => p.start === cluster.start);
          const time = formatTimestamp(cluster.start);
          const excerpt = first?.excerpt ?? '';
          const label =
            cluster.count > 1
              ? t('passageStrip.goToGroup', {
                  time,
                  excerpt,
                  count: cluster.count - 1,
                })
              : t('passageStrip.goTo', { time, excerpt });
          const isCurrent = index === currentIndex;
          const tooltipAlign =
            cluster.leftPct < 33
              ? styles.tooltipStart
              : cluster.leftPct > 67
                ? styles.tooltipEnd
                : styles.tooltipCenter;
          return (
            <div
              key={`${cluster.start}-${index}`}
              className={styles.marker}
              style={{ left: `${cluster.leftPct}%` }}
            >
              <button
                type="button"
                className={styles.markerButton}
                aria-label={label}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => onSeek(cluster.start)}
                onMouseEnter={() => !isTouch && setTooltipIndex(index)}
                onMouseLeave={() => setTooltipIndex(null)}
                onFocus={() => !isTouch && setTooltipIndex(index)}
                onBlur={() => setTooltipIndex(null)}
              >
                <span
                  className={`${styles.tick} ${isCurrent ? styles.tickCurrent : ''}`}
                  aria-hidden="true"
                />
                {cluster.count > 1 && (
                  <span className={styles.badge} aria-hidden="true">
                    {cluster.count}
                  </span>
                )}
              </button>
              {!isTouch && tooltipIndex === index && (
                <span
                  role="tooltip"
                  className={`${styles.tooltip} ${tooltipAlign}`}
                >
                  {cluster.count > 1
                    ? `${time} · ${excerpt} (+${cluster.count - 1})`
                    : `${time} · ${excerpt}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PassageStrip;
