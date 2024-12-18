import React, { FC } from 'react';

import HomeCards from '../../components/ReworkComponents/Cards/CardHome/CardHome';
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
        Description="This will redirect you to the list of available live events."
        ButtonState={ButtonState.disabled}
        buttonList={[
          {
            title: 'Comming soon ...',
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
          Title="Video"
          Description="This will redirect you to the list of available videos."
          buttonList={[
            {
              title: 'Search a video',
              onClickFunction: (e) => {
                e.stopPropagation();
                navigate('/videos');
              },
            },
            {
              title: 'Publish a video',
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
