import React, { FC, useEffect, useState, useCallback } from 'react';
import styles from './Home.module.css';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getVideos,
  getPublishedEvents,
  getEventsMiniature,
} from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import { PublicEvent } from '../../utils/EventsProperties';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import { EventStatus } from '../../utils/EventStatus';

export interface HomeProps {}

const HomePage: FC<HomeProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [videos, setVideos] = useState<Video[]>([]);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    const fetchLastVideos = async () => {
      try {
        const res = await getVideos();
        const allVideos = res.data || [];
        setVideos(
          allVideos
            .sort(
              (a: Video, b: Video) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 3),
        );
      } catch (error) {
        console.error('Error fetching videos:', error);
      }
    };
    fetchLastVideos();
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await getPublishedEvents();
        const allEvents = res.data || [];
        setEvents(
          allEvents
            .sort(
              (a: PublicEvent, b: PublicEvent) =>
                new Date(b.startDate).getTime() -
                new Date(a.startDate).getTime(),
            )
            .slice(0, 3),
        );
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    };
    fetchEvents();
  }, []);

  const fetchMiniatures = useCallback(async () => {
    const newURLs: Record<string, string> = {};

    await Promise.all(
      events.map(async (event) => {
        try {
          const res = await getEventsMiniature(event.id);

          if (res?.data?.url) {
            newURLs[event.id] = res.data.url;
          } else {
            newURLs[event.id] = '/exemple/image_tuile_event.png';
          }
        } catch {
          newURLs[event.id] = '/exemple/image_tuile_event.png';
        }
      }),
    );

    setMiniatureURLs(newURLs);
  }, [events]);

  useEffect(() => {
    if (events.length > 0) fetchMiniatures();
  }, [events, fetchMiniatures]);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('events')}</h2>
        <div className={styles.eventsGrid}>
          {events.map((event) => (
            <EventBox
              key={event.id}
              event={event}
              eventStatus={EventStatus.Published}
              imageURL={miniatureURLs[event.id]}
            />
          ))}
        </div>
        <div className={styles.seeMoreRow}>
          <button
            className={styles.seeMore}
            onClick={() => navigate('/events-home')}
          >
            {t('seeMore')}
            <svg className={styles.arrow} viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H5M11 3V9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('videos')}</h2>
        <div className={styles.videosGrid}>
          {videos.map((video) => (
            <Thumbnail
              key={video.id}
              Id={video.id}
              title={video.title}
              createBy={
                video.creator?.username ||
                `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim()
              }
              createdAt={video.createdAt.toString()}
              tags={video.tags?.map((tag) => tag.name)}
              duration={video.duration}
            />
          ))}
        </div>
        <div className={styles.seeMoreRow}>
          <button
            className={styles.seeMore}
            onClick={() => navigate('/videos')}
          >
            {t('seeMore')}
            <svg className={styles.arrow} viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H5M11 3V9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
