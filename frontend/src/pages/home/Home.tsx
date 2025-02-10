import React, { FC } from 'react';

import HomeCards from '../../components/ReworkComponents/generic/Cards/CardHome/CardHome';
import './Home.css';
import { useNavigate } from 'react-router-dom';

import { ButtonType } from '../../components/ReworkComponents/generic/Button/Button';

export interface HomeProps {}

const HomePage: FC<HomeProps> = () => {
  const navigate = useNavigate();

  return (
    <div className="HomeCard">
      <HomeCards
        title="Streaming"
        description="Cliquez ici pour obtenir la liste des événements en direct disponibles."
        buttonState={ButtonType.disabled}
        buttonList={[
          {
            title: 'Prochainement...',
            onClickFunction: () => {},
          },
        ]}
      />
      <div
        className="cardContainer"
        onClick={() => {
          navigate('/videos');
        }}
      >
        <HomeCards
          title="Vidéos"
          description="Cliquez ici pour obtenir la liste des vidéos disponibles."
          buttonList={[
            {
              title: 'Rechercher une vidéo',
              onClickFunction: (e) => {
                e.stopPropagation();
                navigate('/videos');
              },
            },
            {
              title: 'Publier une vidéo',
              onClickFunction: (e) => {
                e.stopPropagation();
                navigate('/video/video-settings');
              },
            },
          ]}
        />
      </div>
    </div>
  );
};

export default HomePage;
