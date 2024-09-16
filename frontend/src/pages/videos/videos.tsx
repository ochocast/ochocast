import React, { useEffect } from 'react';
import { useState}  from 'react';
import './videos.css';
import { FC } from 'react';
import { getVideos } from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import VideosList from '../../components/newComponents/VideosList/VideosList';

interface VideosProps{}

const Videos: FC<VideosProps> = () => {
  const [videos, setVideo] = useState<Video[]>();
  const userString = localStorage.getItem('backendUser');

  const getMe = async () => {
    const videos_response = await getVideos();
    setVideo(videos_response.data);
  };

  useEffect(() => {
    getMe();
  }, [userString]);

  return (
    <div className="videos">
      <div className='content'>
        {(videos && videos.length != 0) ?
        <VideosList
            title="Vidéos Publiées"
            videos={videos}
          />:
          <h1>No Video Found</h1>
        }
      </div>
    </div>
  );
};

export default Videos;

