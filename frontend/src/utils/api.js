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
export const getUsers = () => api.get('/users');
export const getProfilePicture = (userId) => api.get(`/picture/${userId}`);

// Events
export const createEvent = (event) => api.post('/events', event);
export const getPublishedEvents = () =>
  api.get('/events?closed=false&published=true');
export const getUnpublishedEvents = (userId) =>
  api.get(`/events?closed=false&published=false&creator.id=${userId}`);
export const getClosedEvents = () => api.get('/events?closed=true');
export const getEvent = (eventId) => api.get(`/events?id=${eventId}`);
export const updateEvent = (eventId, event) =>
  api.put('/events/' + eventId, event);
export const deleteEvent = (eventId) => api.delete('/events/' + eventId);

// Tracks
export const getTrackById = (trackId) =>
  api.get('/tracks?id=' + trackId).then((res) => res.data[0]);
export const getTracks = () => api.get('/tracks');
export const createTrack = (track) => api.post('/tracks', track);
export const updateTrack = (trackId, track) =>
  api.put('/tracks/' + trackId, track);
export const deleteTrack = (trackId) => api.delete('/tracks/' + trackId);

// Videos
export const createVideo = (formData) => api.post('/videos/', formData);
export const getVideo = (video_id) => api.get(`/videos?id=${video_id}`);
export const deleteVideo = (video_id) => api.delete(`/videos/` + video_id);
export const deleteVideoAdmin = (video_id) => api.post(`/videos/admin/` + video_id);
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
