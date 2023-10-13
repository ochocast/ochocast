import './App.css';
import { Routes, Route } from 'react-router-dom';
import React from 'react';

import Header from './components/Header/Header';
import LoginPage from './pages/Login/Login';
import EventsPage from './pages/events/events';
import NotFoundPage from './pages/notFound/notFound';
import ProtectedRoute from './utils/ProtectedRoutes';
import LoadingPage from './pages/Loading/Loading';

function App() {
  return (
    <div>
      <Header />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="events"
          element={<ProtectedRoute Element={EventsPage} />}
        />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
