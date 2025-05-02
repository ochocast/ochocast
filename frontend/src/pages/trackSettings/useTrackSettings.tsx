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
import Event from '../../utils/EventsProperties';
import { Track, User } from '../../utils/EventsProperties';

export const useTrackSettings = () => {
  const { eventId, trackId } = useParams();
  const navigate = useNavigate();

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
        const trck = res.data[0];
        if (!trck.startDate)
          trck.startDate = event.startDate;
        if (!trck.endDate)
          trck.endDate = event.endDate;
        setTrack(trck);
        setSpeakers(
          allUsers.filter((user) =>
            trck.speakers.map((e: User) => e.id).includes(user.id),
          ),
        );
      })
      .catch((err) => logger.error(`Failed to fetch track ${trackId}: ${err}`))
      .finally(() => setLoading(false));
  }, [trackId, allUsers, event]);

  useEffect(() => {
    if (!trackId && event) {
      const eventDate = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);

      // Crée une date avec uniquement jour/mois/année de l'event
      const dateOnly = new Date(
        eventDate.getUTCFullYear(),
        eventDate.getUTCMonth(),
        eventDate.getUTCDate(),
      );

      // Applique l'heure de début
      const startDate = new Date(dateOnly);
      startDate.setHours(eventDate.getUTCHours(), eventDate.getUTCMinutes(), 0, 0);

      // Applique l'heure de fin
      const endDate = new Date(dateOnly);
      endDate.setHours(eventEnd.getUTCHours(), eventEnd.getUTCMinutes(), 0, 0);

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
  ) => {
    e.preventDefault();

    if (!data.name?.trim() || !data.description?.trim()) {
      setMessage('Nom et description requis.');
      return;
    }

    if (!data.startDate || !data.endDate) {
      setMessage('Début et fin requis.');
      return;
    }

    if (data.startDate >= data.endDate) {
      setMessage("L'heure de début doit être antérieure à l'heure de fin.");
      return;
    }

    if (event && (data.startDate < event.startDate || data.endDate > event.endDate)) {
      setMessage("L'heure de début et de fin doit être compris dans le crenaux.");
      return;
    }

    if (selectedSpeakers.length === 0) {
      setMessage('Au moins un orateur requis.');
      return;
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
        setTracks((prev) => prev.map((t) => (t.id === trackId ? res.data : t)));
      } else {
        const res = await createTrack(trackBody);
        setTracks((prev) => [...prev, res.data]);
        navigate(`/events/${eventId}/track-settings/${res.data.id}`);
      }
    } catch (err) {
      logger.error(err);
      setMessage("Erreur lors de l'enregistrement de la piste");
    }
  };

  const handleDelete = async () => {
    if (!trackId) return;
    try {
      await deleteTrack(trackId);
      navigate(`/events/${eventId}/event-settings`);
    } catch (err) {
      logger.error(err);
      setMessage('Erreur lors de la suppression de la piste');
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
