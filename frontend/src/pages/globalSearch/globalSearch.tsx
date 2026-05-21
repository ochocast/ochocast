import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import styles from './globalSearch.module.css';
import {
  getEventsMiniature,
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

const searchVideo = (video: Video, query: string): boolean => {
  const creatorName =
    `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim();
  const speakerNames = video.internal_speakers
    ?.map((speaker) =>
      `${speaker.firstName ?? ''} ${speaker.lastName ?? ''}`.trim(),
    )
    .join(' ');

  return [
    video.title,
    video.description,
    video.creator?.username ?? '',
    creatorName,
    speakerNames ?? '',
    video.external_speakers ?? '',
    ...(video.tags?.map((tag) => tag.name) ?? []),
  ].some((field) => matches(field, query));
};

const searchEvent = (event: PublicEvent, query: string): boolean => {
  const trackFields = event.tracks.flatMap((track) => [
    track.name,
    track.description,
    track.keywords,
  ]);

  return [
    event.name,
    event.description,
    ...(event.tags?.map((tag) => tag.name) ?? []),
    ...trackFields,
  ].some((field) => matches(field, query));
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

  const query = useMemo(
    () => new URLSearchParams(location.search).get('q')?.trim() ?? '',
    [location.search],
  );

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
            getVideos(),
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
  }, [getImageUrl, t]);

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
      query.trim()
        ? videos
            .filter((video) => searchVideo(video, query))
            .sort(
              (left, right) =>
                new Date(right.createdAt).getTime() -
                new Date(left.createdAt).getTime(),
            )
        : [],
    [query, videos],
  );

  const filteredEvents = useMemo(
    () =>
      query.trim()
        ? events
            .filter((event) => searchEvent(event, query))
            .sort(
              (left, right) =>
                new Date(right.startDate).getTime() -
                new Date(left.startDate).getTime(),
            )
        : [],
    [query, events],
  );

  const totalResults = filteredVideos.length + filteredEvents.length;

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>{t('globalSearchTitle')}</p>
          <h1 className={styles.title}>
            {query
              ? t('globalSearchResultsFor', { query })
              : t('globalSearchEmptyTitle')}
          </h1>
          <p className={styles.subtitle}>
            {query
              ? t('globalSearchSubtitle')
              : t('globalSearchEmptyDescription')}
          </p>
        </div>

        {query && (
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

      {!query ? (
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
