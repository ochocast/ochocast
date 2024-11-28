import React from 'react';
import { FC, useState } from 'react';
import { Video } from '../../../utils/VideoProperties';

import leftButton from '../../../assets/gauche.png';
import rightButton from '../../../assets/droite.png';

import VideoBox from '../VideoBox/VideoBox';

import './VideosList.css';

interface VideosListProps {
  title: string;
  videos?: Video[];
}

const VideosList: FC<VideosListProps> = ({ title, videos = [] }) => {
  const [index, setIndex] = useState(0); // index of navigation
  // Navigate between videos when clicking arrows

  const onArrowClick = (arrowDirection: boolean) => {
    let i = index;
    if (videos.length > 3) {
      if (arrowDirection === false) {
        if (i === 0) i = videos.length - 3;
        else i = i - 1;
      } else {
        if (i < videos.length - 3) i = i + 1;
        else i = 0;
      }
    }
    setIndex(i);
  };

  return (
    <div className="videos-list">
      <div className="title">{title}</div>
      <div className="list">
        <div className="left-arrow">
          <img
            className="arrow"
            src={leftButton}
            alt="Button"
            onClick={() => onArrowClick(false)}
          ></img>
        </div>
        <div className="video-container">
          {videos &&
            videos
              ?.slice(index, index + 3)
              .map((video, index) => (
                <VideoBox
                  key={index}
                  Id={video.id}
                  title={video.title}
                  description={video.description}
                  creator={video.creator}
                  createdAt={video.createdAt}
                  updatedAt={video.updatedAt}
                  internal_speakers={video.internal_speakers.toString()}
                  external_speakers={video.external_speakers}
                  views={video.views}
                  imageURL="logo_2lignes_crop.png"
                />
              ))}
        </div>
        <div className="right-arrow">
          <img
            className="arrow"
            src={rightButton}
            alt="Button"
            onClick={() => onArrowClick(true)}
          ></img>
        </div>
      </div>
    </div>
  );
};

export default VideosList;
