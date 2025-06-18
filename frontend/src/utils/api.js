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


api.addAsyncRequestTransform(async (request) => {
  const userString = localStorage.getItem('backendUser');
  const user = userString ? JSON.parse(userString) : null;

  if (user?.token) {
    request.headers['Authorization'] = `Bearer ${user.token}`;
  }
});


// Users
export const loginUser = () => api.get('/users/login');
export const getUsers = () => api.get('/users');
export const getProfilePicture = (userId) => api.get(`/users/picture/${userId}`);
export const updateProfile = (newProfile) => api.post(`/users/update`, newProfile);
export const updateProfileWithoutImage = (newProfile) => api.post(`/users/update2`, newProfile);

// Events
export const createEvent = (event) => api.post('/events', event);
export const getPublishedEvents = async () => {
  const res = await api.get('/events?closed=false');
  if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
    throw new Error('Erreur lors de la récupération des événements publiés');
  }
  return res;
};
export const getUnpublishedEvents = async () => {
  const res = await api.get(`/events/unpublished?closed=false&published=false`);
  if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
    throw new Error('Erreur lors de la récupération des événements non publiés');
  }
  return res;
};
export const getClosedEvents = async () => {
  const res = await api.get('/events?closed=true');
  if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
    throw new Error('Erreur lors de la récupération des événements clos');
  }
  return res;
};
export const getPrivateEvent = (eventId) =>
  api.get('/events/private/' + eventId);
export const getPublicEvent = (eventId) => api.get('/events/' + eventId);
export const updateEvent = (eventId, event) =>
  api.put('/events/' + eventId, event);
export const deleteEvent = (eventId) => api.delete('/events/' + eventId);
export const publishEvent = (eventId) => api.put('/events/publish/' + eventId);
export const closeEvent = (eventId) => api.put('/events/close/' + eventId);
export const subscribeEvent = (eventId) => api.put('/events/subscribe/' + eventId);
export const getEventsMiniature = (event_id) =>
  api.get(`/events/miniature/${event_id}`);


// Tracks
export const getTrackById = (trackId) => api.get('/tracks/' + trackId);
export const createTrack = (track) => api.post('/tracks', track);
export const updateTrack = (trackId, track) =>
  api.put('/tracks/' + trackId, track);
export const closeTrack = (trackId) => api.put('/tracks/' + trackId + '/close');
export const deleteTrack = (trackId) => api.delete('/tracks/' + trackId);

// Videos
export const createVideo = (formData) => api.post('/videos/', formData);
export const getVideo = (video_id) => api.get(`/videos?id=${video_id}`);
export const deleteVideo = (video_id) => api.delete(`/videos/` + video_id);
export const deleteVideoAdmin = (video_id) =>
  api.post(`/videos/admin/` + video_id);
export const getVideos = () => api.get(`/videos`);
export const getMedia = (video_id) => api.get(`/videos/media/${video_id}`);
export const getMiniature = (video_id) =>
  api.get(`/videos/miniature/${video_id}`);
export const getVideoByTitle = (video_title) =>
  api.get(`/videos?title=${video_title}`);
export const getTags = () => api.get('/tags');
export const createTag = (data) => api.post('/tags', data);
export const modifyVideo = (formData) => api.post('/videos/modify', formData);
export const getVideosByUser = (userId) => api.get(`/videos/` + userId);
export const findTag = (name) => api.get(`/tags?name=${name}`);
export const findTags = (tag) => api.get(`/tags/find?value=${tag}`);
export const findUsers = (user) => api.get(`/users/find?value=${user}`);
export const getSuggestions = (data) => api.get(`/videos/suggestions/${data}`);

//favori
export const addToFavorites = (videoId) =>
  api.post(`/users/favorites/${videoId}`);
export const removeFromFavorites = (videoId) =>
  api.delete(`/users/favorites/${videoId}`);

export const isVideoFavorite = async (videoId) => {
  const response = await api.get(`/users/favorites/${videoId}`);
  return response?.data?.isFavorite === true;
};
export const getFavoriteVideos = () => api.get('/users/favorites');


