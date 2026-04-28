import { FC, useEffect, useState, useRef, useMemo } from 'react';
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

const GAP_PX = 1.25 * 16;
const HORIZONTAL_PADDING_PX = 2 * 16;
const FULL_CARD_WIDTH_PX = 22 * 16;
const MIN_CARD_WIDTH_PX = 10 * 16;
const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

const computeItemsPerRow = (containerWidth: number): number => {
  if (containerWidth <= 0) return MIN_ITEMS;

  const innerWidth = containerWidth - HORIZONTAL_PADDING_PX;

  const fullSizeCount = Math.floor(
    (innerWidth + GAP_PX) / (FULL_CARD_WIDTH_PX + GAP_PX),
  );

  if (fullSizeCount >= MIN_ITEMS) {
    return Math.min(MAX_ITEMS, fullSizeCount);
  }

  const shrunkCount = Math.floor(
    (innerWidth + GAP_PX) / (MIN_CARD_WIDTH_PX + GAP_PX),
  );

  return Math.max(1, Math.min(MIN_ITEMS, shrunkCount));
};

const HomePage: FC<HomeProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [allEvents, setAllEvents] = useState<PublicEvent[]>([]);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );
  const [itemsPerRow, setItemsPerRow] = useState<number>(MIN_ITEMS);

  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageRef.current) return;

    const updateItemsPerRow = () => {
      if (pageRef.current) {
        const width = pageRef.current.clientWidth;
        setItemsPerRow(computeItemsPerRow(width));
      }
    };

    updateItemsPerRow();

    const resizeObserver = new ResizeObserver(updateItemsPerRow);
    resizeObserver.observe(pageRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const fetchLastVideos = async () => {
      try {
        const res = await getVideos();
        const videos = res.data || [];
        setAllVideos(
          videos.sort(
            (a: Video, b: Video) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
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
        const events = res.data || [];
        setAllEvents(
          events.sort(
            (a: PublicEvent, b: PublicEvent) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
          ),
        );
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    };
    fetchEvents();
  }, []);

  const displayedEvents = useMemo(() => {
    return allEvents.slice(0, itemsPerRow);
  }, [allEvents, itemsPerRow]);

  const displayedVideos = useMemo(() => {
    return allVideos.slice(0, itemsPerRow);
  }, [allVideos, itemsPerRow]);

  // Plus besoin de `displayedEventIds` grâce à useMemo, tu peux effacer cette ligne !

  useEffect(() => {
    const fetchMiniatures = async () => {
      if (displayedEvents.length === 0) return;

      const newURLs: Record<string, string> = {};

      await Promise.all(
        displayedEvents.map(async (event) => {
          try {
            const res = await getEventsMiniature(event.id);
            if (res?.data?.url) {
              newURLs[event.id] = res.data.url;
            }
          } catch (error) {
            // FIX ESLINT (no-empty) : On met un console.debug pour ne pas laisser le catch vide
            console.debug(
              `Miniature indisponible pour l'événement ${event.id}`,
            );
          }
        }),
      );

      setMiniatureURLs((prev) => ({ ...prev, ...newURLs }));
    };

    fetchMiniatures();

    // FIX ESLINT (exhaustive-deps) : On met la vraie dépendance ici
  }, [displayedEvents]);

  return (
    <div ref={pageRef} className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('events')}</h2>
        <div className={styles.eventsGrid}>
          {displayedEvents.map((event) => (
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
          {displayedVideos.map((video) => (
            <Thumbnail
              key={video.id}
              Id={video.id}
              title={video.title}
              creatorId={video.creator?.id}
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
