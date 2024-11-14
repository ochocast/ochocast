import React, { useEffect } from 'react';
import { useState } from 'react';
import './videos.css';
import { FC } from 'react';
import { getVideos } from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import VideosList from '../../components/newComponents/VideosList/VideosList';
import { useNavigate } from 'react-router-dom';
import LoadingCircle from '../../components/newComponents/LoadingCircle/LoadingCircle';
import logger from '../../utils/logger';
import SearchBar from '../../components/ReworkComponents/SearchBar/SearchBar';
import Button, {
  ButtonState,
} from '../../components/ReworkComponents/Button/HomeCardButton/HomeCardButton';

interface VideosProps {}

const Videos: FC<VideosProps> = () => {
  const [videos, setVideo] = useState<Video[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const userString = localStorage.getItem('backendUser');
  const navigate = useNavigate();

  const [isloading, setisLoading] = useState(false);

  const getMe = async () => {
    setisLoading(true);
    try {
      const videos_response = await getVideos();
      setVideo(videos_response.data || []);
      logger.info('Videos successfully fetched');
    } catch (error) {
      logger.error('Error fetching videos:', error);
    }
    setisLoading(false);
  };

  useEffect(() => {
    getMe();
  }, [userString]);

  const handleSearch = (term: string) => {
    logger.info(`Search term: ${term}`);
    setSearchTerm(term);
  };

  // Filtrage des vidéos basé sur le terme de recherche
  const filteredVideos = videos.filter((video) =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  logger.info(`Filtered Videos: ${JSON.stringify(filteredVideos)}`);

  if (isloading) {
    return LoadingCircle();
  }

  return (
    <div className="videos">
      <div className="button-event-creation">
        <Button
          Title="Uploader une vidéo"
          State={ButtonState.colored}
          onClickFunction={() => navigate('/video/video-settings')}
        />
      </div>
      <div className="content">
        <SearchBar onSearch={handleSearch} />
        {filteredVideos.length > 0 ? (
          <VideosList title="Vidéos Publiées" videos={filteredVideos} />
        ) : (
          <h1>No Video Found</h1>
        )}
      </div>
    </div>
  );
};

export default Videos;
