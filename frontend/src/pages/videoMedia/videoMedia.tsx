import React, { useEffect } from 'react';
import { useState}  from 'react';
import './videoMedia.css';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { FC } from 'react';
import { getMedia, getVideo} from '../../utils/api';
import { useParams } from 'react-router-dom';
import { Video } from '../../utils/VideoProperties';
import NotFoundPage from '../notFound/notFound';
import LoadingCircle from '../../components/newComponents/LoadingCircle/LoadingCircle';
const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

interface VideoMediaProps{}

const VideoMedia: FC<VideoMediaProps> = () => {
  const { videoId }= useParams();
  const [url, setUrl] = useState<string>('');
  const [video, setVideo] = useState<Video>();
  const [isLoading, setIsLoading] =  useState(false);
  // Durée d'expiration en secondes, doit etre equivalent a la durée mise en backend
  const linkExpirationTime = 3600;
  const renewalThreshold = 300;

  const renewSignedUrl = async () => {
    const url_response = await getMedia(videoId);
    if (url_response != undefined)
      setUrl(url_response.data);
  };


  useEffect(() => {
    const getMe = async () => {
      setIsLoading(true);
      const video_response = await getVideo(videoId);
      const url_response = await getMedia(videoId);
      if (url_response != undefined)
        setUrl(url_response.data);
      if(video_response != undefined)
        setVideo(video_response.data[0]);
      setIsLoading(false);
    };
    getMe();
  }, [videoId]);

  setTimeout(renewSignedUrl, (linkExpirationTime - renewalThreshold) * 1000);


  if (isLoading){
    return LoadingCircle();
  }

  if(video != undefined)
    return (
    <div className="player-wrapper">
    <div className="video-details">
      <h2 className="video-title">{video?.title}</h2>
      <p className="video-description">{video?.description}</p>
    </div>

    <div className="player">
      <ReactPlayer
        url={url}
        playing={false}
        controls={true}
        width="100%"
        height="100%"
        config={{
          file: {
          },
        }}
      />
    </div>
    </div>
    );
  else
    return NotFoundPage();
};

export default VideoMedia;  
