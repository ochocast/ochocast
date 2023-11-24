import { create } from 'apisauce';

export const api = create({
  baseURL: `${process.env.REACT_APP_API_URL}:${process.env.REACT_APP_API_PORT}/api`,
  timeout: 20000, // 20 seconds
  maxContentLength: 10000000,
  maxBodyLength: 10000000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Users
export const loginUser = () => api.get('/users/login');

// Events
export const createEvent = (event) => api.post('/events', event);
export const getPublishedEvents = () =>
  api.get('/events?closed=false&published=true');
export const getUnpublishedEvents = () =>
  api.get('/events?closed=false&published=false');
export const getClosedEvents = () => api.get('/events?closed=true');
export const getEvent = (eventId) => api.get(`/events?id=${eventId}`);
export const updateEvent = (eventId, event) =>
  api.put('/events/' + eventId, event);

// Tracks
export const getTrackById = (trackId) =>
  api.get('/tracks?id=' + trackId).then((res) => res.data[0]);
export const getTracks = () => api.get('/tracks');
export const createTrack = (track) => api.post('/tracks', track);
export const updateTrack = (trackId, track) =>
  api.put('/tracks/' + trackId, track);
