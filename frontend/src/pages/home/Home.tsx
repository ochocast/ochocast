import React, { FC } from 'react';

import HomeCards from '../../components/ReworkComponents/generic/Cards/CardHome/CardHome';
import styles from './Home.module.css';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

//import { ButtonState } from '../../components/ReworkComponents/Button/HomeCardButton/HomeCardButton';

export interface HomeProps {}

const HomePage: FC<HomeProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  console.log('HomePage rendered');

  return (
    <>
      <div className={styles.HomeCard}>
        <HomeCards
          title={t('streaming')}
          description={t('getAvailableLiveEvents')}
          //buttonState={ButtonState.disabled}
          buttonList={[
            {
              title: t('searchAnEvent'),
              onClickFunction: (e) => {
                e.stopPropagation();
                navigate('/events-home');
              },
            },
          ]}
        />
        <div
          className={styles.cardContainer}
          onClick={() => {
            navigate('/videos');
          }}
        >
          <HomeCards
            title={t('videos')}
            description={t('getAvailableVideos')}
            buttonList={[
              {
                title: t('searchAVideo'),
                onClickFunction: (e) => {
                  e.stopPropagation();
                  navigate('/videos');
                },
              },
              {
                title: t('publishAVideo'),
                onClickFunction: (e) => {
                  e.stopPropagation();
                  navigate('/video/video-settings');
                },
              },
            ]}
          />
        </div>
      </div>
    </>
  );
};

export default HomePage;
