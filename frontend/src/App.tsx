import './App.css';
import { Routes, Route } from 'react-router-dom';

import LoginPage from './pages/Login/Login';
import EventsPage from './pages/events/events';
import Header from './components/Header/Header';
import NotFoundPage from './pages/notFound/notFound';
import ProtectedRoute from './utils/ProtectedRoutes';
import LoadingPage from './pages/Loading/Loading';

function App() {

  return (
      <Routes>
          <Route path='/' element={<Header/>} >
            <Route index element={<LoginPage/>} />
            <Route path='events' element={<ProtectedRoute Element={EventsPage}/>} />
          </Route>
          <Route path='/loading' element={<LoadingPage/>} />
          <Route path='*' element={<NotFoundPage />} />
      </Routes>
  );
}


export default App;
