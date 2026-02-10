import { useState, useEffect, FormEvent } from 'react';
import {
  getPrivateEvent,
  getTrackById,
  getUsers,
  createTrack,
  updateTrack,
  deleteTrack,
} from '../../utils/api';
import { useNavigate, useParams } from 'react-router-dom';
import logger from '../../utils/logger';
import Event, { PublicUser } from '../../utils/EventsProperties';
import { Track, User } from '../../utils/EventsProperties';
import { useTranslation } from 'react-i18next';

export const useTrackSettings = () => {
  const { eventId, trackId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [event, setEvent] = useState<Event>();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [track, setTrack] = useState<Partial<Track>>({});
  const [speakers, setSpeakers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Get users
  useEffect(() => {
    getUsers()
      .then((res) => {
        if (res.status === 200) setAllUsers(res.data);
      })
      .catch((err) => logger.error(`Failed to fetch users: ${err}`));
  }, []);

  // Get event + tracks
  useEffect(() => {
    if (!eventId) return;
    getPrivateEvent(eventId)
      .then((res) => {
        if (res.status === 200) {
          setEvent(res.data);
          setTracks(res.data.tracks);
        }
      })
      .catch((err) => logger.error(`Failed to fetch event: ${err}`));
  }, [eventId]);

  // Get track details if editing
  useEffect(() => {
    if (!trackId || !event) return;
    setLoading(true);
    getTrackById(trackId)
      .then((res) => {
        const eventDate = new Date(event.startDate);
        const eventEnd = new Date(event.endDate);
        const trck: Track = res.data;
        trck.startDate = new Date(trck.startDate);
        trck.endDate = new Date(trck.endDate);

        if (!trck.startDate) trck.startDate = eventDate;
        if (!trck.endDate) trck.endDate = eventEnd;

        setTrack(trck);

        // If allUsers is loaded, filter speakers by ID
        if (allUsers.length > 0) {
          setSpeakers(
            allUsers.filter((user) =>
              trck.speakers.map((e: PublicUser) => e.id).includes(user.id),
            ),
          );
        } else if (trck.speakers.length > 0) {
          // If allUsers is not loaded yet, use speakers directly as fallback
          setSpeakers(trck.speakers as User[]);
        }
      })
      .catch((err) => {
        logger.error(`Failed to fetch track ${trackId}: ${err}`);
        navigate('/my-events');
      })
      .finally(() => setLoading(false));
  }, [trackId, event, navigate, allUsers]);

  useEffect(() => {
    if (!trackId && event) {
      const eventDate = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);

      const startDate = new Date(
        Date.UTC(
          eventDate.getUTCFullYear(),
          eventDate.getUTCMonth(),
          eventDate.getUTCDate(),
          eventDate.getUTCHours(),
          eventDate.getUTCMinutes(),
          0,
          0,
        ),
      );

      const endDate = new Date(
        Date.UTC(
          eventEnd.getUTCFullYear(),
          eventEnd.getUTCMonth(),
          eventEnd.getUTCDate(),
          eventEnd.getUTCHours(),
          eventEnd.getUTCMinutes(),
          0,
          0,
        ),
      );

      setTrack({
        name: '',
        description: '',
        startDate,
        endDate,
        closed: false,
      });

      setSpeakers([]);
    }
  }, [trackId, event]);

  const handleSubmit = async (
    e: FormEvent<HTMLFormElement>,
    data: Partial<Track>,
    selectedSpeakers: User[],
  ): Promise<boolean> => {
    e.preventDefault();

    if (!data.name?.trim() || !data.description?.trim()) {
      setMessage(t('NameDescriptionRequired'));
      return false;
    }

    if (!data.startDate || !data.endDate) {
      setMessage(t('StartEndRequired'));
      return false;
    }

    if (data.startDate.getTime() >= data.endDate.getTime()) {
      setMessage(t('StartTimeError'));
      return false;
    }

    const eventStart = event ? new Date(event.startDate) : new Date();
    const eventEnd = event ? new Date(event.endDate) : new Date();

    if (event && (data.startDate < eventStart || data.endDate > eventEnd)) {
      setMessage(t('TimeError'));
      return false;
    }

    if (selectedSpeakers.length === 0) {
      setMessage(t('SpeakerError'));
      return false;
    }

    const trackBody = {
      name: data.name,
      description: data.description,
      keywords: [],
      startDate: data.startDate,
      endDate: data.endDate,
      eventId: eventId,
      speakers: speakers.map((s) => s.id),
    };

    try {
      if (trackId) {
        const res = await updateTrack(trackId, trackBody);
        if (res.status !== 200) throw res.data;
        setTracks((prev) => prev.map((t) => (t.id === trackId ? res.data : t)));
      } else {
        const res = await createTrack(trackBody);
        setTracks((prev) => [...prev, res.data]);
        navigate(`/events/${eventId}/track-settings/${res.data.id}`);
      }
    } catch (err) {
      logger.error(err);
      setMessage(t('ErrorSavingTrack'));
      return false;
    }
    return true;
  };

  const handleDelete = async () => {
    if (!trackId) return;
    try {
      await deleteTrack(trackId);
      navigate(`/events/${eventId}/event-settings`);
    } catch (err) {
      logger.error(err);
      setMessage(t('DeleteTrackError'));
    }
  };

  return {
    allUsers,
    event,
    tracks,
    track,
    setTrack,
    speakers,
    setSpeakers,
    message,
    setMessage,
    handleSubmit,
    handleDelete,
    loading,
    navigate,
  };
};
