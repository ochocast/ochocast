import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMiniature } from '../../utils/api';
import { SearchHit } from '../../utils/searchApi';
import { formatTimestamp } from '../../utils/formatTimestamp';
import ViewIcon from '../../assets/ViewIcon.svg';
import HighlightedText from './HighlightedText';
import styles from './SearchVideoResult.module.css';

const FALLBACK_MINIATURE = '/branding/exemple/image_tuile_event.png';
const BEST_PASSAGES_SHOWN = 3;
const MATCH_ORDER = [
  'title',
  'tags',
  'people',
  'description',
  'transcript',
] as const;

export interface SearchVideoResultProps {
  hit: SearchHit;
  /** Raw query typed by the user; empty in filter-only mode. */
  query: string;
}

// Same units and `timeAgo.*` keys as the video thumbnails.
const RELATIVE_UNITS = [
  ['timeAgo.minutes', 60],
  ['timeAgo.hours', 3600],
  ['timeAgo.days', 86400],
  ['timeAgo.months', 30 * 86400],
  ['timeAgo.years', 365 * 86400],
] as const;

const SearchVideoResult: React.FC<SearchVideoResultProps> = ({
  hit,
  query,
}) => {
  const { t } = useTranslation();
  const { video } = hit;
  const [expanded, setExpanded] = useState(false);
  const [miniatureUrl, setMiniatureUrl] = useState(FALLBACK_MINIATURE);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getMiniature(video.id);
        const url = response?.data;
        if (
          !cancelled &&
          typeof url === 'string' &&
          url &&
          !url.includes('miniatureundefined')
        ) {
          setMiniatureUrl(url);
        }
      } catch {
        // keep the fallback image
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [video.id]);

  const relativeDate = (): string => {
    const seconds = Math.max(
      0,
      (Date.now() - new Date(video.createdAt).getTime()) / 1000,
    );
    if (seconds < 60) return t('timeAgo.now');
    const [unit, size] =
      [...RELATIVE_UNITS].reverse().find(([, s]) => seconds >= s) ??
      RELATIVE_UNITS[0];
    return t(unit, { count: Math.floor(seconds / size) });
  };

  const videoPath = `/video/${video.id}`;
  const encodedQuery = encodeURIComponent(query);
  const videoLink = query ? `${videoPath}?q=${encodedQuery}` : videoPath;
  const creator =
    video.creator.username ||
    `${video.creator.firstName} ${video.creator.lastName}`.trim();
  const meta = [creator, relativeDate(), video.speakers.join(', ')]
    .filter(Boolean)
    .join(' · ');

  const bestPassages = hit.passages.filter((p) => p.best);
  const shownPassages = expanded
    ? hit.passages
    : bestPassages.slice(0, BEST_PASSAGES_SHOWN);
  const hiddenCount = hit.passages.length - shownPassages.length;
  const canToggle = expanded || hiddenCount > 0;
  const matches = MATCH_ORDER.filter((m) => hit.matchedIn.includes(m));

  return (
    <article className={styles.card}>
      <Link
        to={videoLink}
        className={styles.thumbnailLink}
        aria-hidden="true"
        tabIndex={-1}
      >
        <span className={styles.thumbnail}>
          <img
            className={styles.thumbnailImage}
            src={miniatureUrl}
            alt=""
            onError={(event) => {
              const fallback = new URL(FALLBACK_MINIATURE, window.location.href)
                .href;
              if (event.currentTarget.src !== fallback) {
                event.currentTarget.src = fallback;
              }
            }}
          />
          <span className={`${styles.badge} ${styles.viewsBadge}`}>
            <img className={styles.viewIcon} src={ViewIcon} alt="" />
            {video.views}
          </span>
          {video.duration > 0 && (
            <span className={`${styles.badge} ${styles.durationBadge}`}>
              {formatTimestamp(video.duration)}
            </span>
          )}
        </span>
      </Link>

      <div className={styles.body}>
        <Link to={videoLink} className={styles.titleLink}>
          <HighlightedText
            parts={hit.titleParts}
            className={`${styles.mark} ${styles.titleMark}`}
          />
        </Link>
        <span className={styles.meta}>{meta}</span>

        {matches.length > 0 && (
          <span className={styles.foundIn}>
            <span>{t('searchResult.foundIn')}</span>
            {matches.map((match) => (
              <span key={match} className={styles.foundBadge}>
                {t(`searchResult.matchedIn.${match}`, {
                  count: hit.passageCount,
                })}
              </span>
            ))}
          </span>
        )}

        {hit.passages.length > 0 && (
          <div className={styles.passages}>
            {shownPassages.map((passage, index) => (
              <Link
                key={`${passage.start}-${index}`}
                className={styles.passage}
                to={`${videoPath}?t=${Math.floor(passage.start)}&q=${encodedQuery}`}
              >
                <span className={styles.timestamp}>
                  ▶ {formatTimestamp(passage.start)}
                </span>
                <span className={styles.excerpt}>
                  «{' '}
                  <HighlightedText
                    parts={passage.parts}
                    className={styles.mark}
                  />{' '}
                  »
                </span>
              </Link>
            ))}
            {canToggle && (
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? t('searchResult.lessPassages')
                  : t('searchResult.morePassages', { count: hiddenCount })}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default SearchVideoResult;
