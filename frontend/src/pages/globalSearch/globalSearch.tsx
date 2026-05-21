import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import styles from './globalSearch.module.css';
import {
  getEventsMiniature,
  getFavoriteVideos,
  getPublishedEvents,
  getVideos,
} from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import { PublicEvent } from '../../utils/EventsProperties';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
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

const matchesVideoFilters = (
  video: Video,
  filters: GlobalSearchFilters,
): boolean => {
  const creatorName =
    `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim();
  const speakerNames = video.internal_speakers
    ?.map((speaker) =>
      `${speaker.firstName ?? ''} ${speaker.lastName ?? ''}`.trim(),
    )
    .join(' ');

  return (
    matchesSelectedTags(
      filters.tags,
      video.tags?.map((tag) => tag.name) ?? [],
    ) &&
    matchesAnySelected(filters.users, [
      video.creator?.username,
      video.creator?.firstName,
      video.creator?.lastName,
      creatorName,
      speakerNames,
    ]) &&
    matchesDateRange(video.createdAt, filters.dateFrom, filters.dateTo) &&
    (filters.archived === null || video.archived === filters.archived)
  );
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

const searchVideo = (
  video: Video,
  query: string,
  filters: GlobalSearchFilters,
): boolean => {
  if (!matchesVideoFilters(video, filters)) return false;

  const creatorName =
    `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim();
  const speakerNames = video.internal_speakers
    ?.map((speaker) =>
      `${speaker.firstName ?? ''} ${speaker.lastName ?? ''}`.trim(),
    )
    .join(' ');

  return matchesTextQuery(
    [
      video.title,
      video.description,
      video.creator?.username ?? '',
      creatorName,
      speakerNames ?? '',
      video.external_speakers ?? '',
      ...(video.tags?.map((tag) => tag.name) ?? []),
    ],
    query,
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
    track.keywords,
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
      [track.name, track.description, track.keywords].some((field) =>
        matches(field ?? '', query),
      ),
    )
    .map((track) => track.name)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4);
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
  const query = searchParams.q;

  const [videos, setVideos] = useState<Video[]>([]);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [eventMiniatures, setEventMiniatures] = useState<
    Record<string, string>
  >({});
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [videosResponse, eventsResponse, fallbackResponse] =
          await Promise.all([
            searchParams.favoris ? getFavoriteVideos() : getVideos(),
            getPublishedEvents(),
            getImageUrl('default_miniature_image'),
          ]);

        if (!active) return;

        setVideos(videosResponse.data || []);
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
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [getImageUrl, searchParams.favoris, t]);

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

  const filteredVideos = useMemo(
    () =>
      videos
        .filter((video) => searchVideo(video, query, searchParams))
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        ),
    [query, searchParams, videos],
  );

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

  const totalResults = filteredVideos.length + filteredEvents.length;
  const criteriaActive = query.trim() !== '' || hasActiveFilters(searchParams);

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
            <span className={styles.resultMetaChip}>
              {t('globalSearchEventsCount', { count: filteredEvents.length })}
            </span>
            <span className={styles.resultMetaChip}>
              {t('globalSearchVideosCount', { count: filteredVideos.length })}
            </span>
            <span className={styles.resultMetaChipAccent}>
              {t('globalSearchTotal')}: {totalResults}
            </span>
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
      ) : totalResults === 0 ? (
        <section className={styles.emptyState}>
          <h2>{t('globalSearchNoResults')}</h2>
          <p>{t('globalSearchNoResultsDescription', { query })}</p>
        </section>
      ) : (
        <div className={styles.sections}>
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

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>{t('videos')}</p>
                <h2>
                  {t('globalSearchVideosCount', {
                    count: filteredVideos.length,
                  })}
                </h2>
              </div>
            </div>

            {filteredVideos.length > 0 ? (
              <div className={styles.videoGrid}>
                {filteredVideos.map((video) => (
                  <div className={styles.videoCard} key={video.id}>
                    <Thumbnail
                      Id={video.id}
                      title={video.title}
                      creatorId={video.creator?.id || ''}
                      createBy={
                        video.creator?.username ||
                        `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim()
                      }
                      createdAt={video.createdAt.toString()}
                      tags={video.tags
                        ?.map((tag) => tag.name)
                        .sort((a, b) => a.localeCompare(b))}
                      cropTags={true}
                      duration={video.duration}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.sectionEmpty}>
                {t('globalSearchNoVideos')}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default GlobalSearchPage;
