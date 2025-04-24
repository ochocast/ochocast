import React from 'react';
import './waitingScreen.css';

const WaitingScreen = () => {
  return (
    <div className="waiting-screen">
      <img
        src="/OctoTechno.png"
        alt="Waiting illustration"
        className="waiting-illustration"
      />
        <p className="waiting-text">
        Veuillez patienter
        <span className="dot">.</span>
        <span className="dot">.</span>
        <span className="dot">.</span>
        </p>
        <h2>La session commencera bientôt.</h2>
    </div>
  );
};

export default WaitingScreen;
