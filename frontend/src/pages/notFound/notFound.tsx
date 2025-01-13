import React from 'react';
import { Link } from 'react-router-dom';
import './notFound.css';

const NotFoundPage = () => {
  return (
    <div className="notFound">
      <h1>404 - Page introuvable</h1>
      <p>Désolé, la page que vous recherchez n&apos;existe pas.</p>
      <Link to="/">Retour à l&apos;accueil</Link>
    </div>
  );
};

export default NotFoundPage;
