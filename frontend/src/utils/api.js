import { create } from 'apisauce';
import { User } from 'oidc-client-ts';

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
export const getPublishedEvents = () => api.get('/events?published=true');
export const getUnpublishedEvents = () => api.get('/events?published=false');
export const getEvent = (eventId) => api.get(`/events?id=${eventId}`);

// Tracks
export const getTrack = (trackId) => api.get('/tracks?id=' + trackId);
export const getTracks = () => api.get('/tracks');
export const createTrack = (track) => api.post('/tracks', track);

