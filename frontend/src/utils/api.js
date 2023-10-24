import { create } from 'apisauce';
import { User } from 'oidc-client-ts';


function getToken() {
  const oidcStorage = localStorage.getItem(`oidc.user:${process.env.REACT_APP_AUTHORIZATION_ENDPOINT}:${process.env.REACT_APP_CLIENT_ID}`);
  if (!oidcStorage) return null;

  const user = User.fromStorageString(oidcStorage);
  return user.access_token;
}

const api = create({
  baseURL: `${process.env.REACT_APP_API_URL}:${process.env.REACT_APP_API_PORT}/api`,
  timeout: 20000, // 20 seconds
  maxContentLength: 10000000,
  maxBodyLength: 10000000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  }
});

// Users

// Events
export const createEvent = (event) => api.post('/events', event);
export const getPublishedEvents = () => api.get('/events?published=true');
export const getUnpublishedEvents = () => api.get('/events?published=false');

// Tracks
export const getTracks = () => api.get('/tracks');
