import './App.css';
import { Routes, Route } from 'react-router-dom';
import React from 'react';
import { BrandingProvider } from './context/BrandingContext';

import Header from './components/ReworkComponents/generic/Header/Header';
import LoginPage from './pages/Login/Login';
import EventsPage from './pages/events/events';
import TracksPage from './pages/tracks/tracks';
import NotFoundPage from './pages/notFound/notFound';
import TrackSettings from './pages/trackSettings/trackSettings';
import EventSettings from './pages/eventSettings/eventSettings';
import VideoSettings from './pages/videoSettings/videoSettings';
import LiveTrack from './pages/liveTrack/liveTrack';
import StreamTrack from './pages/streamingTrack/streamTrack';
import VideoMedia from './pages/videoMedia/videoMedia';
import Videos from './pages/videos/videos';
import HomePage from './pages/home/Home';
import Profile from './pages/profile/profile';
import {ProtectedRoutes} from "./utils/ProtectedRoutes";
import EventStatistic from './pages/eventStatistics/eventStatistics';
import EventsHomePage from './pages/eventsHome/eventsHome';
import ProfileSetting from './pages/ProfileSettings/ProfileSettings';
import MyEvents from './pages/myEvents/myEvents';
import CreateEvent from './pages/CreateEvent/createEvent';

function App() {
  return (
    <BrandingProvider>
    <ProtectedRoutes>
      <Header />
      <Routes>
        <Route path="/" element={< HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/events"
          element={<EventsPage/>}
        />
        <Route 
          path="/events-home"
          element={<EventsHomePage/>}
        />
        <Route 
          path="/my-events"
          element={<MyEvents/>}
        />
        <Route 
          path="/my-events/create" 
          element={<CreateEvent />} 
        />
        <Route
          path="/events/:eventId/event-settings"
          element={<EventSettings/>}
        />
        <Route
          path="/events/:eventId/event-statistics"
          element={<EventStatistic/>}
        />
        <Route
          path="/events/:eventId/tracks"
          element={<TracksPage/>}
        />
        <Route
          path="/events/:eventId/track-settings"
          element={<TrackSettings/>}
        />
        <Route
          path="/events/:eventId/track-settings/:trackId"
          element={<TrackSettings/>}
        />
        <Route
          path="/tracks/:trackId"
          element={<LiveTrack/>}
        />
        <Route
          path="/tracks/:trackId/streaming"
          element={<StreamTrack/>}
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
          path="/profile/profile-settings"
          element={<ProfileSetting />}
        />
        <Route
          path="/video/:videoId"
          element={<VideoMedia />}
        />
        <Route path="/videos" element={<Videos/>} />
        <Route path="/profile" element={<Profile/>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ProtectedRoutes>
    </BrandingProvider>
  );
}

export default App;
