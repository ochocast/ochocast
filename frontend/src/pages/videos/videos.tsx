import React, { useEffect, useState } from 'react';
import style from './videos.module.css';
import { useTranslation } from 'react-i18next';

import { FC } from 'react';
import { getVideos, getSuggestions } from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import logger from '../../utils/logger';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import FavorisFilterNotSelected from '../../assets/FavorisFilterNotSelected.svg';

interface VideosProps {}

const Videos: FC<VideosProps> = () => {
  console.log(localStorage.getItem('backendUser'));
  const [videos, setVideo] = useState<Video[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  // Simuler un appel API pour récupérer des vidéos
  const getMe = async () => {
    setIsLoading(true);
    try {
      const videosResponse = await getVideos();
      setVideo(videosResponse.data || []);
    } catch (error) {
      logger.error('Error fetching videos:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    getMe();
  }, [userString]);

  const handleSearch = async (keywords: string[]) => {
    try {
      if (keywords[0] !== '') {
        const response = await getSuggestions(keywords[0]);
        setVideo(response.data || []);
      } else {
        const videosResponse = await getVideos();
        setVideo(videosResponse.data || []);
      }
    } catch (error) {
      logger.error('Error fetching suggestions:', error);
    }
  };

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.videos}>
      <div className={style.display}>
        <div className={style.display1}>
          <div className={style.SearchBar}>
            <SearchBar
              onClick={(query) => {
                handleSearch([query]);
              }}
              needInput={true}
              placeholder={t('exemple')}
              icon={SearchBarIcon.SEARCH}
            />
          </div>
          <img
            className={style.starIconFilterContainer}
            src={FavorisFilterNotSelected}
            onClick={() => {}}
          />
        </div>

        <div className={style.video_row}>
          {videos.length > 0 ? (
            videos.map((video) => (
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                createBy={video.creator.firstName}
                views={video.views}
                createdAt={video.createdAt.toString()}
                tags={video.tags && video.tags?.map((tag) => tag.name)}
              />
            ))
          ) : (
            <h1>{t('noVideoFound')}</h1>
          )}
        </div>
      </div>
    </div>
  );
};

export default Videos;
