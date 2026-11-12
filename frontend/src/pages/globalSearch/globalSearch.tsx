import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import styles from './globalSearch.module.css';
import { getEventsMiniature, getPublishedEvents } from '../../utils/api';
import {
  SearchApiError,
  SearchHit,
  SearchParams,
  searchContent,
} from '../../utils/searchApi';
import { PublicEvent } from '../../utils/EventsProperties';
import SearchVideoResult from '../../components/search/SearchVideoResult';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import { EventStatus } from '../../utils/EventStatus';
import { useBrandingContext } from '../../context/BrandingContext';
import logger from '../../utils/logger';

const removeAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalize = (value: string): string => removeAccents(value).toLowerCase();

const matches = (haystack: string, query: string): boolean => {
  if (!query.trim()) return false;
  return normalize(haystack).includes(normalize(query));
};

/** Converts a field that might be a string, array, null or undefined to a plain string */
const toStringField = (value: unknown): string => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(' ');
  return String(value);
};

interface GlobalSearchFilters {
  q: string;
  tags: string[];
  users: string[];
  dateFrom: string | null;
  dateTo: string | null;
  favoris: boolean;
  archived: boolean | null;
}

const parseSearchParams = (search: string): GlobalSearchFilters => {
  const params = new URLSearchParams(search);

  return {
    q: params.get('q')?.trim() ?? '',
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    users: params.get('users')?.split(',').filter(Boolean) || [],
    dateFrom: params.get('dateFrom') || null,
    dateTo: params.get('dateTo') || null,
    favoris: params.get('favoris') === 'true',
    archived:
      params.get('archived') === 'true'
        ? true
        : params.get('archived') === 'false'
          ? false
          : null,
  };
};

const hasActiveFilters = (filters: GlobalSearchFilters): boolean =>
  filters.tags.length > 0 ||
  filters.users.length > 0 ||
  Boolean(filters.dateFrom) ||
  Boolean(filters.dateTo) ||
  filters.favoris ||
  filters.archived !== null;

const matchesAnySelected = (
  selectedValues: string[],
  candidateValues: Array<string | null | undefined>,
): boolean => {
  if (selectedValues.length === 0) return true;

  const normalizedCandidates = candidateValues
    .filter(Boolean)
    .map((value) => normalize(value as string));

  return selectedValues.some((selectedValue) =>
    normalizedCandidates.includes(normalize(selectedValue)),
  );
};

const matchesDateRange = (
  value: string | Date,
  dateFrom: string | null,
  dateTo: string | null,
): boolean => {
  if (!dateFrom && !dateTo) return true;

  const currentDate = new Date(value);

  if (dateFrom && currentDate < new Date(dateFrom)) return false;
  if (dateTo && currentDate > new Date(dateTo)) return false;
  return true;
};

const matchesSelectedTags = (
  selectedTags: string[],
  itemTags: Array<string | null | undefined>,
): boolean => {
  if (selectedTags.length === 0) return true;

  return itemTags.some((tag) =>
    selectedTags.some(
      (selectedTag) => normalize(tag ?? '') === normalize(selectedTag),
    ),
  );
};

const matchesTextQuery = (
  fields: Array<string | null | undefined>,
  query: string,
): boolean => {
  if (!query.trim()) return true;
  return fields.some((field) => matches(field ?? '', query));
};

const matchesEventFilters = (
  event: PublicEvent,
  filters: GlobalSearchFilters,
): boolean => {
  const trackSpeakers = event.tracks
    .flatMap((track) => track.speakers ?? [])
    .map((speaker) =>
      `${speaker.firstName ?? ''} ${speaker.lastName ?? ''}`.trim(),
    );

  return (
    matchesSelectedTags(
      filters.tags,
      event.tags?.map((tag) => tag.name) ?? [],
    ) &&
    matchesAnySelected(filters.users, [
      event.creator?.firstName,
      event.creator?.lastName,
      `${event.creator?.firstName ?? ''} ${event.creator?.lastName ?? ''}`.trim(),
      ...trackSpeakers,
    ]) &&
    matchesDateRange(event.startDate, filters.dateFrom, filters.dateTo) &&
    (filters.archived === null || event.closed === filters.archived)
  );
};

const searchEvent = (
  event: PublicEvent,
  query: string,
  filters: GlobalSearchFilters,
): boolean => {
  if (!matchesEventFilters(event, filters)) return false;

  const trackFields = event.tracks.flatMap((track) => [
    track.name,
    track.description,
    toStringField(track.keywords),
  ]);

  return matchesTextQuery(
    [
      event.name,
      event.description,
      ...(event.tags?.map((tag) => tag.name) ?? []),
      ...trackFields,
    ],
    query,
  );
};

const getMatchingTracks = (event: PublicEvent, query: string): string[] => {
  if (!query.trim()) return [];

  return event.tracks
    .filter((track) =>
      [track.name, track.description, toStringField(track.keywords)].some(
        (field) => matches(field, query),
      ),
    )
    .map((track) => track.name)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4);
};

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type VideosStatus =
  | 'idle'
  | 'loading'
  | 'loadingMore'
  | 'error'
  /** The API refused the query (400): too many words or characters. */
  | 'tooLong'
  | 'moreError';

interface VideoResults {
  /** The query these hits answer (the URL may have changed since). */
  q: string;
  hits: SearchHit[];
  total: number;
  passageTotal: number;
}

/** Passes the URL parameters to the API as they are. */
const buildApiParams = (search: string): SearchParams => {
  const params = new URLSearchParams(search);
  const apiParams: SearchParams = {};

  const q = params.get('q')?.trim();
  if (q) apiParams.q = q;

  const tags = params.get('tags');
  if (tags) apiParams.tags = tags;
  const users = params.get('users');
  if (users) apiParams.users = users;
  const dateFrom = params.get('dateFrom');
  if (dateFrom) apiParams.dateFrom = dateFrom;
  const dateTo = params.get('dateTo');
  if (dateTo) apiParams.dateTo = dateTo;

  const favoris = params.get('favoris');
  if (favoris !== null) apiParams.favoris = favoris === 'true';
  const archived = params.get('archived');
  if (archived !== null) apiParams.archived = archived === 'true';

  const sort = params.get('sort');
  if (sort === 'relevance' || sort === 'recent') apiParams.sort = sort;

  return apiParams;
};

/** « No video matches … » and, when there is a query, search tips. */
const NoVideosMessage = ({ query }: { query: string }) => {
  const { t } = useTranslation();

  if (!query) {
    return <p>{t('globalSearchNoVideos')}</p>;
  }

  return (
    <>
      <p className={styles.noVideosMessage}>
        {t('globalSearchNoVideosFor', { query })}
      </p>
      <div className={styles.tips}>
        <p className={styles.tipsTitle}>{t('globalSearchTipsTitle')}</p>
        <ul>
          <li>{t('globalSearchTipSpelling')}</li>
          <li>{t('globalSearchTipBroader')}</li>
          <li>{t('globalSearchTipExclusion')}</li>
        </ul>
      </div>
    </>
  );
};

const GlobalSearchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getImageUrl } = useBrandingContext();

  const searchParams = useMemo(
    () => parseSearchParams(location.search),
    [location.search],
  );
  const apiParams = useMemo(
    () => buildApiParams(location.search),
    [location.search],
  );
  const query = searchParams.q;
  const sort = apiParams.sort === 'recent' ? 'recent' : 'relevance';
  const criteriaActive = query.trim() !== '' || hasActiveFilters(searchParams);

  const [videoResults, setVideoResults] = useState<VideoResults | null>(null);
  const [videosStatus, setVideosStatus] = useState<VideosStatus>('idle');
  const [videosFirstLoadDone, setVideosFirstLoadDone] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestSeq = useRef(0);
  const previousQuery = useRef<string | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [eventMiniatures, setEventMiniatures] = useState<
    Record<string, string>
  >({});
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<string>('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'events' | 'videos'>(
    'all',
  );

  useEffect(() => {
    setFilterType('all');
  }, [location.search]);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setEventsLoading(true);
      setError(null);

      try {
        const [eventsResponse, fallbackResponse] = await Promise.all([
          getPublishedEvents(),
          getImageUrl('default_miniature_image'),
        ]);

        if (!active) return;

        setEvents(eventsResponse.data || []);
        setFallbackMiniatureUrl(
          fallbackResponse || '/branding/exemple/image_tuile_event.png',
        );
      } catch (fetchError) {
        if (!active) return;

        logger.error(
          { err: fetchError },
          'Error loading global search results',
        );
        setError(t('globalSearchLoadError'));
      } finally {
        if (active) {
          setEventsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [getImageUrl, t]);

  // Videos come from the API. A response that arrives after the URL changed
  // (or after the page was left) is ignored through `requestSeq`. The header
  // navigates on every keystroke, so a change of `q` waits for the typing to
  // pause; the first load, sort, filters and retry go out immediately.
  useEffect(() => {
    if (!criteriaActive) {
      previousQuery.current = null;
      setVideoResults(null);
      setVideosStatus('idle');
      return;
    }

    const currentQuery = apiParams.q ?? '';
    const queryChanged =
      previousQuery.current !== null && previousQuery.current !== currentQuery;
    previousQuery.current = currentQuery;

    setVideosStatus('loading');

    const fetchFirstPage = () => {
      const requestId = ++requestSeq.current;

      searchContent({ ...apiParams, limit: PAGE_SIZE, offset: 0 })
        .then((response) => {
          if (requestSeq.current !== requestId) return;
          setVideoResults({
            q: currentQuery,
            hits: response?.videos ?? [],
            total: response?.total ?? 0,
            passageTotal: response?.passageTotal ?? 0,
          });
          setVideosStatus('idle');
          setVideosFirstLoadDone(true);
        })
        .catch((searchError) => {
          if (requestSeq.current !== requestId) return;
          logger.error({ err: searchError }, 'Error searching videos');
          setVideoResults(null);
          setVideosStatus(
            searchError instanceof SearchApiError && searchError.status === 400
              ? 'tooLong'
              : 'error',
          );
          setVideosFirstLoadDone(true);
        });
    };

    const timer = queryChanged
      ? setTimeout(fetchFirstPage, SEARCH_DEBOUNCE_MS)
      : undefined;
    if (!queryChanged) fetchFirstPage();

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      requestSeq.current += 1;
    };
  }, [apiParams, criteriaActive, retryCount]);

  const loadMoreVideos = useCallback(async () => {
    if (!videoResults) return;

    const requestId = ++requestSeq.current;
    setVideosStatus('loadingMore');

    try {
      const response = await searchContent({
        ...apiParams,
        limit: PAGE_SIZE,
        offset: videoResults.hits.length,
      });
      if (requestSeq.current !== requestId) return;

      // Read the response outside the updater: a malformed 2xx must not throw
      // while React renders.
      const newHits = response?.videos ?? [];
      const newTotal = response?.total;
      const newPassageTotal = response?.passageTotal;

      setVideoResults((previous) => {
        if (!previous) return previous;
        const known = new Set(previous.hits.map((hit) => hit.video.id));
        return {
          ...previous,
          hits: [
            ...previous.hits,
            ...newHits.filter((hit) => !known.has(hit.video.id)),
          ],
          total: newTotal ?? previous.total,
          passageTotal: newPassageTotal ?? previous.passageTotal,
        };
      });
      setVideosStatus('idle');
    } catch (searchError) {
      if (requestSeq.current !== requestId) return;
      logger.error({ err: searchError }, 'Error loading more videos');
      setVideosStatus('moreError');
    }
  }, [apiParams, videoResults]);

  const handleRetryVideos = () => {
    if (videosStatus === 'moreError') {
      loadMoreVideos();
    } else {
      setRetryCount((count) => count + 1);
    }
  };

  const handleSortChange = (nextSort: 'relevance' | 'recent') => {
    if (nextSort === sort) return;

    const params = new URLSearchParams(location.search);
    if (nextSort === 'recent') {
      params.set('sort', 'recent');
    } else {
      params.delete('sort');
    }
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    let active = true;

    const fetchMiniatures = async () => {
      if (events.length === 0) {
        setEventMiniatures({});
        return;
      }

      const entries = await Promise.all(
        events.map(async (event) => {
          try {
            const response = await getEventsMiniature(event.id);
            if (
              response?.data?.url &&
              typeof response.data.url === 'string' &&
              !response.data.url.includes('imageSlug')
            ) {
              return [event.id, response.data.url] as const;
            }
          } catch (miniatureError) {
            logger.error(
              { err: miniatureError },
              `Error fetching miniature for event ${event.id}`,
            );
          }

          return [
            event.id,
            fallbackMiniatureUrl || '/branding/exemple/image_tuile_event.png',
          ] as const;
        }),
      );

      if (!active) return;

      setEventMiniatures(Object.fromEntries(entries));
    };

    fetchMiniatures();

    return () => {
      active = false;
    };
  }, [events, fallbackMiniatureUrl]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => searchEvent(event, query, searchParams))
        .sort(
          (left, right) =>
            new Date(right.startDate).getTime() -
            new Date(left.startDate).getTime(),
        ),
    [query, searchParams, events],
  );

  const videosFailed = videosStatus === 'error' || videosStatus === 'tooLong';
  const videosTotal = videoResults?.total ?? 0;
  // A failed search says nothing about the videos: leave them out of the counts.
  const totalResults = filteredEvents.length + (videosFailed ? 0 : videosTotal);
  const videosSettled = videosStatus === 'idle' && videoResults !== null;
  const noResultsAtAll =
    videosSettled && videosTotal === 0 && filteredEvents.length === 0;
  const isLoading = eventsLoading || (criteriaActive && !videosFirstLoadDone);

  const pageTitle = query
    ? t('globalSearchResultsFor', { query })
    : criteriaActive
      ? t('globalSearchFilteredTitle')
      : t('globalSearchEmptyTitle');

  const pageSubtitle = query
    ? t('globalSearchSubtitle')
    : criteriaActive
      ? t('globalSearchFilteredSubtitle')
      : t('globalSearchEmptyDescription');

  if (isLoading) {
    return <LoadingCircle />;
  }

  const videosError = (
    <div className={styles.videosError} role="alert">
      <p>{t('globalSearchVideosError')}</p>
      <button
        type="button"
        className={styles.actionButton}
        onClick={handleRetryVideos}
      >
        {t('retry')}
      </button>
    </div>
  );

  // Retrying cannot help: the query itself has to change.
  const videosTooLong = (
    <div className={styles.videosError} role="alert">
      <p>{t('globalSearchQueryTooLong')}</p>
    </div>
  );

  let videosBody: React.ReactNode;
  if (videosStatus === 'tooLong') {
    videosBody = videosTooLong;
  } else if (videosStatus === 'error') {
    videosBody = videosError;
  } else if (!videoResults) {
    videosBody = (
      <p className={styles.sectionEmpty} role="status">
        {t('globalSearchVideosLoading')}
      </p>
    );
  } else if (videoResults.total === 0 && videosStatus !== 'loading') {
    videosBody = (
      <div className={styles.sectionEmpty}>
        <NoVideosMessage query={query} />
      </div>
    );
  } else {
    videosBody = (
      <>
        <div
          className={styles.videoList}
          aria-busy={videosStatus === 'loading'}
        >
          {videoResults.hits.map((hit) => (
            <SearchVideoResult
              key={hit.video.id}
              hit={hit}
              query={videoResults.q}
              fallbackMiniatureUrl={fallbackMiniatureUrl || undefined}
            />
          ))}
        </div>
        {videosStatus === 'moreError' && videosError}
        {videosStatus !== 'moreError' &&
          videoResults.hits.length < videoResults.total && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.loadMore}`}
              onClick={loadMoreVideos}
              disabled={videosStatus !== 'idle'}
            >
              {videosStatus === 'loadingMore'
                ? t('globalSearchLoadingMore')
                : t('globalSearchLoadMoreVideos')}
            </button>
          )}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>{t('globalSearchTitle')}</p>
          <h1 className={styles.title}>{pageTitle}</h1>
          <p className={styles.subtitle}>{pageSubtitle}</p>
        </div>

        {criteriaActive && (
          <div
            className={styles.resultMeta}
            aria-label={t('globalSearchTotal')}
          >
            <button
              type="button"
              className={`${styles.resultMetaChip} ${
                filterType === 'events'
                  ? styles.activeChip
                  : filterType !== 'all'
                    ? styles.dimmedChip
                    : ''
              }`}
              onClick={() =>
                setFilterType(filterType === 'events' ? 'all' : 'events')
              }
            >
              {filterType === 'events' && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.checkmarkIcon}
                >
                  <polyline points="10 3 4.5 8.5 2 6" />
                </svg>
              )}
              {t('globalSearchEventsCount', { count: filteredEvents.length })}
            </button>
            {!videosFailed && (
              <button
                type="button"
                className={`${styles.resultMetaChip} ${
                  filterType === 'videos'
                    ? styles.activeChip
                    : filterType !== 'all'
                      ? styles.dimmedChip
                      : ''
                }`}
                onClick={() =>
                  setFilterType(filterType === 'videos' ? 'all' : 'videos')
                }
              >
                {filterType === 'videos' && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.checkmarkIcon}
                  >
                    <polyline points="10 3 4.5 8.5 2 6" />
                  </svg>
                )}
                {t('globalSearchVideosCount', { count: videosTotal })}
              </button>
            )}
            {query !== '' && videoResults && (
              <span className={styles.passagesChip}>
                {t('globalSearchPassagesCount', {
                  count: videoResults.passageTotal,
                })}
              </span>
            )}
            <button
              type="button"
              className={`${styles.resultMetaChipAccent} ${
                filterType !== 'all' ? styles.clickableTotal : ''
              }`}
              onClick={() => setFilterType('all')}
              disabled={filterType === 'all'}
              title={
                filterType !== 'all' ? t('filterPanel.resetFilters') : undefined
              }
            >
              {t('globalSearchTotal')}: {totalResults}
            </button>
          </div>
        )}
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {!criteriaActive ? (
        <section className={styles.emptyState}>
          <h2>{t('globalSearchHintTitle')}</h2>
          <p>{t('globalSearchHintDescription')}</p>
          <div className={styles.emptyStateActions}>
            <button type="button" onClick={() => navigate('/events-home')}>
              {t('events')}
            </button>
            <button type="button" onClick={() => navigate('/videos')}>
              {t('videos')}
            </button>
          </div>
        </section>
      ) : noResultsAtAll ? (
        <section className={styles.emptyState}>
          <h2>{t('globalSearchNoResults')}</h2>
          <NoVideosMessage query={query} />
        </section>
      ) : (
        <div className={styles.sections}>
          {filterType !== 'videos' && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>{t('events')}</p>
                  <h2>
                    {t('globalSearchEventsCount', {
                      count: filteredEvents.length,
                    })}
                  </h2>
                </div>
              </div>

              {filteredEvents.length > 0 ? (
                <div className={styles.eventGrid}>
                  {filteredEvents.map((event) => {
                    const matchingTracks = getMatchingTracks(event, query);

                    return (
                      <div className={styles.eventCard} key={event.id}>
                        <EventBox
                          event={event}
                          eventStatus={EventStatus.Published}
                          imageURL={eventMiniatures[event.id]}
                        />

                        {matchingTracks.length > 0 && (
                          <div className={styles.trackMatches}>
                            <span className={styles.trackMatchesLabel}>
                              {t('globalSearchTrackMatches')}
                            </span>
                            <div className={styles.trackPills}>
                              {matchingTracks.map((track) => (
                                <span
                                  key={`${event.id}-${track}`}
                                  className={styles.trackPill}
                                >
                                  {track}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>
                  {t('globalSearchNoEvents')}
                </div>
              )}
            </section>
          )}

          {filterType !== 'events' && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>{t('videos')}</p>
                  {videoResults && (
                    <h2>
                      {t('globalSearchVideosCount', { count: videosTotal })}
                    </h2>
                  )}
                </div>
                {query !== '' && videoResults && videoResults.total > 0 && (
                  <div
                    className={styles.sortGroup}
                    role="group"
                    aria-label={t('globalSearchSortBy')}
                  >
                    <span className={styles.sortLabel} aria-hidden="true">
                      {t('globalSearchSortBy')}
                    </span>
                    {(['relevance', 'recent'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.sortButton} ${
                          sort === option ? styles.sortButtonActive : ''
                        }`}
                        aria-pressed={sort === option}
                        onClick={() => handleSortChange(option)}
                      >
                        {option === 'recent'
                          ? t('globalSearchSortRecent')
                          : t('globalSearchSortRelevance')}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {videosBody}
            </section>
          )}
        </div>
      )}
    </main>
  );
};

export default GlobalSearchPage;
