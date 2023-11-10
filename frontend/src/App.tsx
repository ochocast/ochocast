import './App.css';
import { Routes, Route, useNavigate } from 'react-router-dom';
import React from 'react';

import Header from './components/Header/Header';
import LoginPage from './pages/Login/Login';
import EventsPage from './pages/events/events';
import TracksPage from './pages/tracks/tracks';
import NotFoundPage from './pages/notFound/notFound';
import ProtectedRoute from './utils/ProtectedRoutes';
import LoadingPage from './pages/Loading/Loading';
import TrackSettings from './pages/trackSettings/trackSettings';
import EventSettings from './pages/eventSettings/eventSettings';
import { useAuth } from 'react-oidc-context';
import { User } from 'oidc-client-ts';
import { api, loginUser } from './utils/api';
import LiveTrack from './pages/liveTrack/liveTrack';


function App() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  const fetchBackendUser = async () => {
    try {
      const res = await loginUser();
      localStorage.setItem('backendUser', JSON.stringify(await res.data));
    } catch (error) {
      console.error(`Failed to fetch user: ${error}`);
    }
  };

  React.useEffect(() => {
    const oidcStorage = localStorage.getItem(
      `oidc.user:${process.env.REACT_APP_AUTHORIZATION_ENDPOINT}:${process.env.REACT_APP_CLIENT_ID}`,
    );
    if (oidcStorage && !isAuthenticated) {
      const user = User.fromStorageString(oidcStorage);
      if (user && !user.expired) {
        auth.signinSilent();
        setIsAuthenticated(true);
        api.setHeaders({ Authorization: `Bearer ${user.access_token}` });
        fetchBackendUser();
      }
    }
  }, [auth, navigate, isAuthenticated]);

  return (
    <div>
      <Header />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/events"
          element={<ProtectedRoute Element={EventsPage} />}
        />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/events/:eventId/settings" element={<EventSettings />} />
        <Route
          path="/events/:eventId/tracks"
          element={<ProtectedRoute Element={TracksPage} />}
        />
        <Route
          path="/events/:eventId/track-settings"
          element={<TrackSettings isNew={true} />}
        />
        <Route
          path="/events/:eventId/track-settings/:trackId"
          element={<TrackSettings isNew={false} />}
        />
        <Route
          path="/tracks/:trackId"
          element={<ProtectedRoute Element={LiveTrack} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
