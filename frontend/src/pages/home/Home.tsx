import React, { FC } from 'react';

import HomeCards from '../../components/ReworkComponents/HomeCard/HomeCard';
import './Home.css';
import { useNavigate } from 'react-router-dom';

import { ButtonState } from '../../components/ReworkComponents/Button/HomeCardButton/HomeCardButton';

export interface HomeProps {}

const HomePage: FC<HomeProps> = () => {
  const navigate = useNavigate();

  return (
    <div className="HomeCard">
      <HomeCards
        Title="Streaming"
        Description="tre"
        ButtonTitle="Comming soon ..."
        ButtonState={ButtonState.disabled}
      />
      <HomeCards
        Title="Vidéo"
        Description="dfsf"
        ButtonTitle="Go to the page"
        onClickFunction={() => {
          navigate('/videos');
        }}
      />
    </div>
  );
};

export default HomePage;
