import React from 'react';
import { Link } from 'react-router-dom';
import './notFound.css';

const NotFoundPage = () => {
  return (
    <div className="notFound">
      <h1>404 - Page Not Found</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <Link to="/">Go to Home</Link>
    </div>
  );
};

export default NotFoundPage;
