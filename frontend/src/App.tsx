import './App.css';
import { Routes, Route/*, useNavigate*/ } from 'react-router-dom';
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
  //const navigate = useNavigate();

  React.useEffect(() => {
    if (auth.user && !auth.user.expired) {
      // Utilisation du token pour configurer les headers de l'API
      api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });

      // Récupération des informations utilisateur via le backend
      const fetchBackendUser = async () => {
        try {
          const res = await loginUser();
          console.log('Backend user:', res.data);
        } catch (error) {
          console.error(`Failed to fetch user: ${error}`);
        }
      };

      fetchBackendUser();
    } else if (!auth.isLoading && !auth.user) {
      // Rediriger l'utilisateur vers la connexion si non authentifié
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
        <Route path="/home" element={<ProtectedRoute Element={HomePage} />} />
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
          element={<ProtectedRoute Element={VideoSettings} />}
        />
        <Route
          path="/video/:videoId"
          element={<ProtectedRoute Element={VideoMedia} />}
        />
        <Route path="/videos" element={<ProtectedRoute Element={Videos} />} />
        <Route path="/profile" element={<ProtectedRoute Element={Profile} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
