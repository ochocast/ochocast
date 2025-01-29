import './App.css';
import { Routes, Route } from 'react-router-dom';
import React from 'react';

import Header from './components/ReworkComponents/Header/Header';
import LoginPage from './pages/Login/Login';
import EventsPage from './pages/events/events';
import TracksPage from './pages/tracks/tracks';
import NotFoundPage from './pages/notFound/notFound';
import ProtectedRoute from './utils/ProtectedRoutes';
import LoadingPage from './pages/Loading/Loading';
import TrackSettings from './pages/trackSettings/trackSettings';
import EventSettings from './pages/eventSettings/eventSettings';

import VideoSettings from './pages/videoSettings/videoSettings';

import { useAuth } from 'react-oidc-context';
import { api, loginUser } from './utils/api';
import LiveTrack from './pages/liveTrack/liveTrack';
import StreamTrack from './pages/streamingTrack/streamTrack';
import VideoMedia from './pages/videoMedia/videoMedia';
import Videos from './pages/videos/videos';
import HomePage from './pages/home/Home';
import Profile from './pages/profile/profile';

function App() {
  const auth = useAuth();

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      api.setHeaders({ Authorization: `Bearer ${token}` });
    }

    if (auth.user && !auth.user.expired) {
      const accessToken = auth.user.access_token;
      localStorage.setItem('access_token', accessToken);
      api.setHeaders({ Authorization: `Bearer ${accessToken}` });

      const fetchBackendUser = async () => {
        try {
          const res = await loginUser();
          localStorage.setItem('backendUser', JSON.stringify(res.data));
        } catch (error) {
          console.error(`Failed to fetch user: ${error}`);
        }
      };

      fetchBackendUser();
    } else if (!auth.isLoading && !auth.user) {
      auth.signinRedirect();
    }
  }, [auth]);

  if (auth.isLoading) {
    return <LoadingPage />;
  }

  return (
    <div>
      <Header />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={< HomePage />} />
        <Route
          path="/events"
          element={<ProtectedRoute Element={EventsPage} />}
        />
        <Route path="/loading" element={<LoadingPage />} />
        <Route
          path="/events/:eventId/event-settings"
          element={<ProtectedRoute Element={EventSettings} />}
        />
        <Route
          path="/events/:eventId/tracks"
          element={<ProtectedRoute Element={TracksPage} />}
        />
        <Route
          path="/events/:eventId/track-settings"
          element={<ProtectedRoute Element={TrackSettings} />}
        />
        <Route
          path="/events/:eventId/track-settings/:trackId"
          element={<ProtectedRoute Element={TrackSettings} />}
        />
        <Route
          path="/tracks/:trackId"
          element={<ProtectedRoute Element={LiveTrack} />}
        />
        <Route
          path="/tracks/:trackId/streaming"
          element={<ProtectedRoute Element={StreamTrack} />}
        />
        <Route
          path="/video/video-settings"
          element={<VideoSettings />}
        />
        <Route
          path="/video/video-settings/:videoId"
          element={<VideoSettings />}
        />
        <Route
          path="/video/:videoId"
          element={<VideoMedia />}
        />
        <Route path="/videos" element={<ProtectedRoute Element={Videos} />} />
        <Route path="/profile" element={<ProtectedRoute Element={Profile} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
