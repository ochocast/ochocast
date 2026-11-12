import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import HighlightedText from '../search/HighlightedText';
import {
  getTranscript,
  SearchApiError,
  TranscriptResult,
  TranscriptSegment,
} from '../../utils/searchApi';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { StripPassage } from './PassageStrip';
import { lastReachedIndex } from './playbackPosition';
import styles from './TranscriptPanel.module.css';

interface TranscriptPanelProps {
  videoId: string;
  initialQuery: string;
  currentTime: number;
  /** `transcription_status` of the video (pending, processing, ready...). */
  transcriptionStatus: string;
  onSeek: (seconds: number) => void;
  onMatchesChange: (passages: StripPassage[]) => void;
  className?: string;
}

const DEBOUNCE_MS = 300;
const NO_PASSAGES: StripPassage[] = [];

/** Index of the transcript line holding `element`, null for anything else. */
const lineIndexOf = (element: EventTarget | null): number | null => {
  if (!(element instanceof HTMLElement)) return null;
  const index = Number(element.dataset.index);
  return element.dataset.index !== undefined && Number.isInteger(index)
    ? index
    : null;
};

interface Loaded {
  result: TranscriptResult | null;
  /** Query the result was fetched for. */
  query: string;
  failed: boolean;
  /** HTTP status of the failed request, when there is one. */
  errorStatus?: number;
}

const segmentText = (segment: TranscriptSegment): string =>
  segment.parts.map((part) => part.text).join('');

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches);

interface LineProps {
  index: number;
  segment: TranscriptSegment;
  active: boolean;
  /** The single line of the list that Tab reaches. */
  tabbable: boolean;
  onSeek: (seconds: number) => void;
}

const TranscriptLine = React.memo<LineProps>(
  ({ index, segment, active, tabbable, onSeek }) => (
    <li>
      <button
        type="button"
        data-index={index}
        tabIndex={tabbable ? 0 : -1}
        className={`${styles.line} ${active ? styles.active : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSeek(segment.start)}
      >
        <span className={styles.time}>{formatTimestamp(segment.start)}</span>
        <span className={styles.text}>
          <HighlightedText parts={segment.parts} className={styles.mark} />
        </span>
      </button>
    </li>
  ),
);
TranscriptLine.displayName = 'TranscriptLine';

const Panel: React.FC<TranscriptPanelProps> = ({
  videoId,
  initialQuery,
  currentTime,
  transcriptionStatus,
  onSeek,
  onMatchesChange,
  className,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [fetchQuery, setFetchQuery] = useState(initialQuery);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The line focus was moved to while the list has focus; null once focus
  // leaves it, so that the tab stop follows the active line again.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onSeekRef = useRef(onSeek);
  const onMatchesRef = useRef(onMatchesChange);
  onSeekRef.current = onSeek;
  onMatchesRef.current = onMatchesChange;
  const seek = useCallback((seconds: number) => onSeekRef.current(seconds), []);

  // Debounce the typed query.
  useEffect(() => {
    if (query === fetchQuery) return undefined;
    const timer = setTimeout(() => setFetchQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, fetchQuery]);

  // Fetch; a response of an older request is dropped by the cleanup.
  useEffect(() => {
    let cancelled = false;
    const trimmed = fetchQuery.trim();
    getTranscript(videoId, trimmed)
      .then((result) => {
        if (!cancelled) setLoaded({ result, query: trimmed, failed: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const errorStatus =
          error instanceof SearchApiError ? error.status : undefined;
        // Once a transcript has been shown, a failed search keeps it.
        setLoaded((previous) =>
          previous?.result?.status === 'ready'
            ? { ...previous, failed: true, errorStatus }
            : { result: null, query: trimmed, failed: true, errorStatus },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, fetchQuery]);

  const result = loaded?.result ?? null;
  const ready = result?.status === 'ready';
  const searchFailed = loaded?.failed === true;
  const segments = useMemo(() => {
    if (!ready || !result) return [];
    if (!searchFailed) return result.segments;
    // Highlights would contradict the query that just failed.
    return result.segments.map((segment) => ({
      ...segment,
      parts: [{ text: segmentText(segment), hit: false }],
    }));
  }, [ready, result, searchFailed]);

  const matchStarts = useMemo(() => {
    if (!ready || !result || !loaded?.query || searchFailed) return [];
    return result.matches
      .map((index) => result.segments[index]?.start)
      .filter((start): start is number => typeof start === 'number');
  }, [ready, result, loaded, searchFailed]);

  const passages = useMemo<StripPassage[]>(() => {
    if (!ready || !result || !loaded?.query || searchFailed) {
      return NO_PASSAGES;
    }
    return result.matches
      .filter((index) => result.segments[index])
      .map((index) => ({
        start: result.segments[index].start,
        excerpt: segmentText(result.segments[index]),
      }));
  }, [ready, result, loaded, searchFailed]);

  useEffect(() => {
    onMatchesRef.current(passages);
  }, [passages]);

  const segmentStarts = useMemo(
    () => segments.map((segment) => segment.start),
    [segments],
  );
  const activeIndex = lastReachedIndex(segmentStarts, currentTime);

  // Roving tab stop: one line only is in the tab order, the arrow keys move
  // between lines.
  let tabStop = activeIndex >= 0 ? activeIndex : 0;
  if (focusedIndex !== null && focusedIndex < segments.length) {
    tabStop = focusedIndex;
  }

  const handleListFocus = (event: React.FocusEvent<HTMLUListElement>) => {
    const index = lineIndexOf(event.target);
    if (index !== null) setFocusedIndex(index);
  };

  const handleListBlur = (event: React.FocusEvent<HTMLUListElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusedIndex(null);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const from = lineIndexOf(event.target);
    if (from === null || segments.length === 0) return;
    const last = segments.length - 1;
    let to: number;
    switch (event.key) {
      case 'ArrowDown':
        to = Math.min(from + 1, last);
        break;
      case 'ArrowUp':
        to = Math.max(from - 1, 0);
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocusedIndex(to);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-index="${to}"]`)
      ?.focus();
  };

  // Follow the playback inside the list only, never the page.
  useEffect(() => {
    const list = listRef.current;
    if (!list || activeIndex < 0 || prefersReducedMotion()) return;
    const item = list.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(
        0,
        top - list.clientHeight / 2 + item.offsetHeight / 2,
      );
    }
  }, [activeIndex]);

  const isPreparing =
    result?.status === 'pending' ||
    (loaded !== null &&
      !ready &&
      (transcriptionStatus === 'pending' ||
        transcriptionStatus === 'processing'));

  if (isPreparing) {
    return (
      <aside className={`${styles.panel} ${className ?? ''}`}>
        <p className={styles.preparing}>{t('transcriptPanel.preparing')}</p>
      </aside>
    );
  }
  if (!ready || !result) return null;

  const currentOccurrence = lastReachedIndex(matchStarts, currentTime);
  const total = matchStarts.length;
  const goTo = (index: number) => onSeek(matchStarts[index]);

  let counter = '';
  if (total > 0) {
    counter = t('transcriptPanel.counter', {
      current: currentOccurrence + 1,
      total,
    });
  } else if (loaded?.query && !searchFailed) {
    counter = t('transcriptPanel.noOccurrence');
  }

  return (
    <aside
      className={`${styles.panel} ${className ?? ''}`}
      aria-label={t('transcriptPanel.region')}
    >
      <p className={styles.heading}>
        {result.source === 'auto'
          ? t('transcriptPanel.titleAuto')
          : t('transcriptPanel.titleProvided')}
      </p>
      <div className={styles.search}>
        <svg
          className={styles.searchIcon}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          type="search"
          className={styles.input}
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('transcriptPanel.search')}
          placeholder={t('transcriptPanel.search')}
        />
        <span className={styles.counter} aria-live="polite">
          {counter}
        </span>
        {total > 0 && (
          <>
            <button
              type="button"
              className={styles.step}
              aria-label={t('transcriptPanel.previous')}
              disabled={currentOccurrence <= 0}
              onClick={() => goTo(currentOccurrence - 1)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 8l3-3 3 3" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.step}
              aria-label={t('transcriptPanel.next')}
              disabled={currentOccurrence >= total - 1}
              onClick={() => goTo(currentOccurrence + 1)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 4l3 3 3-3" />
              </svg>
            </button>
          </>
        )}
      </div>
      {searchFailed && (
        <p role="status" className={styles.notice}>
          {loaded?.errorStatus === 400
            ? t('transcriptPanel.tooLong')
            : t('transcriptPanel.unavailable')}
        </p>
      )}
      {/* The lines are buttons: the list only routes the arrow keys. */}
      <ul
        className={styles.list}
        ref={listRef}
        data-testid="transcript-list"
        onFocus={handleListFocus}
        onBlur={handleListBlur}
        onKeyDown={handleListKeyDown}
      >
        {segments.map((segment, index) => (
          <TranscriptLine
            key={index}
            index={index}
            segment={segment}
            active={index === activeIndex}
            tabbable={index === tabStop}
            onSeek={seek}
          />
        ))}
      </ul>
    </aside>
  );
};

/** Remounted per video so the query and the results start fresh. */
const TranscriptPanel: React.FC<TranscriptPanelProps> = (props) => (
  <Panel key={props.videoId} {...props} />
);

export default TranscriptPanel;
