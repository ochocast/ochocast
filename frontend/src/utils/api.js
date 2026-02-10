import { create } from 'apisauce';
import getEnv from './env';

export const api = create({
  baseURL: `${getEnv('REACT_APP_API_URL')}:${getEnv('REACT_APP_API_PORT')}/api`,
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

// Public API instance without authentication
export const publicApi = create({
  baseURL: `${getEnv('REACT_APP_API_URL')}:${getEnv('REACT_APP_API_PORT')}/api`,
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
export const getProfilePicture = (userId) =>
  api.get(`/users/picture/${userId}`);
export const updateProfile = (newProfile) =>
  api.post(`/users/update`, newProfile);
export const updateProfileWithoutImage = (newProfile) =>
  api.post(`/users/update2`, newProfile);

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
    throw new Error(
      'Erreur lors de la récupération des événements non publiés',
    );
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
export const subscribeEvent = (eventId) =>
  api.put('/events/subscribe/' + eventId);
export const unsubscribeEvent = (eventId) =>
  api.delete('/events/unsubscribe/' + eventId);
export const getEventsMiniature = (event_id) =>
  api.get(`/events/miniature/${event_id}`);

// Tracks
export const getTrackById = (trackId) => api.get('/tracks/' + trackId);
export const getTrackByIdPublic = (trackId) =>
  publicApi.get('/tracks/' + trackId);
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
export const getSubtitle = (video_id) =>
  api.get(`/videos/subtitle/${video_id}`);
export const getVideoByTitle = (video_title) =>
  api.get(`/videos?title=${video_title}`);
export const getTags = () => api.get('/tags');
export const createTag = (data) => api.post('/tags', data);
export const modifyVideo = (formData) => api.post('/videos/modify', formData);
export const getVideosByUser = (userId) => api.get(`/videos/` + userId);
export const findTag = (name) => api.get(`/tags?name=${name}`);
export const findTags = (tag) => api.get(`/tags/find?value=${tag}`);
export const findUsers = (user) => api.get(`/users/find?value=${user}`);
export const searchVideos = (data) => api.get(`/videos/searchvideo/${data}`);
export const getVideoSuggestions = (id) =>
  api.get(`/videos/videoSuggestions/${id}`);

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

//Comments
export const getComments = (videoId) => api.get(`/comments/${videoId}`);
export const createComment = (commentData) =>
  api.post('/comments', commentData);
export const deleteComment = (id) => api.delete(`/comments/${id}`);
export const likeComment = (commentId) =>
  api.post(`/comments/like/${commentId}`);
export const unlikeComment = (commentId) =>
  api.delete(`/comments/like/${commentId}`);

//User likes
export const userLikeComment = (commentId) =>
  api.post(`/users/like/${commentId}`);
export const userUnlikeComment = (commentId) =>
  api.delete(`/users/like/${commentId}`);
export const getLikedComments = () => api.get('/users/like');

//config management
export const getConfig = () => api.get('/config');
export const uploadConfig = (formData) => api.post('/config', formData);
export const getBrandingPicture = (key) => api.get(`/config/picture/${key}`);
export const resetConfig = () => api.delete('/config/reset');

//Chat
export const getTrackMessages = (trackId) =>
  api.get(`/chat/tracks/${trackId}/messages`);
export const clearTrackMessages = (trackId) =>
  api.delete(`/chat/tracks/${trackId}/messages`);
export const deleteMessage = (messageId) =>
  api.delete(`/chat/messages/${messageId}`);
export const getEventChatStatistics = (eventId, subscriberCount = 0) =>
  api.get(
    `/chat/events/${eventId}/statistics?subscriberCount=${subscriberCount}`,
  );
export const getTrackChatStatistics = (trackId) =>
  api.get(`/chat/tracks/${trackId}/statistics`);

// SFU viewer count
export const getRoomViewerCount = async (roomId) => {
  const sfuUrl =
    process.env.REACT_APP_SFU_CONTROL_PLANE_URL || 'http://localhost:8090';
  try {
    const response = await fetch(`${sfuUrl}/room/viewers?room_id=${roomId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch viewer count');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching viewer count:', error);
    return { viewer_count: 0 };
  }
};

export const searchVideosAdmin = (data) =>
  api.get(`/videos/searchvideoadmin/${data}`);

// Recording
export const startRecording = (data) => api.post('/recordings/start', data);
export const stopRecording = (trackId) =>
  api.post(`/recordings/stop/${trackId}`);

// Polls
export const createPoll = (pollData) => api.post('/polls', pollData);
export const votePoll = (pollId, voteData) =>
  api.post(`/polls/${pollId}/vote`, voteData);
export const getPollsByTrack = (trackId) => api.get(`/polls/track/${trackId}`);
export const getPollsByTrackPublic = (trackId) =>
  publicApi.get(`/polls/track/${trackId}`);
export const votePollPublic = (pollId, voteData) =>
  publicApi.post(`/polls/${pollId}/vote`, voteData);
export const closePoll = (pollId) => api.post(`/polls/${pollId}/close`);
export const deletePoll = (pollId) => api.delete(`/polls/${pollId}`);
