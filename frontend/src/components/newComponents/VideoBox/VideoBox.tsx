import { useNavigate } from 'react-router-dom';
import  { User } from "../../../utils/VideoProperties";
import { FC } from 'react';
import './VideoBox.css';
import React from 'react';

// Changera probablement a la propriete video contenant toutes les informations necessaires
interface VideoBoxProps {
  Id?: string;
  title?: string;
  description?: string;
  creator?: User;
  createdAt: Date;
  updatedAt: Date;
  internal_speakers: string;
  external_speakers: string;
  views: number;
  imageURL?: string;
}

const VideoBox: FC<VideoBoxProps> = ({
  Id,
  title,
  description,
  creator,
  createdAt,
  /*updatedAt,
  internal_speakers,
  external_speakers,
  views,*/
  imageURL,
}) => {
  const dateDisplay = new Date(createdAt); // to be able to getDay..
  const navigate = useNavigate();

  return (
    <div className="video-box">
      <div className="img-div">
        <img
          className="video-image"
          src={require('../../../assets/' + imageURL)}
          alt="img"
          onClick={() => navigate(`/video/${Id}`)}
        ></img>
      </div>
      <div className="video-wrapper">
        <div
          className="video-title"
          onClick={() => navigate(`/video/${Id}`)}
        >
          {title}
        </div>
        <div
          className="video-description"
        >
          {description}
        </div>
        <div className="video-date">{`Date de publication: ${dateDisplay.getDay()}/${
          dateDisplay.getMonth() + 1
        }/${dateDisplay.getFullYear()}`}</div>
      </div>
      <div className="video-wrapper">
        <div className="video-info">{`Publié par : ${
          (creator?.firstName ? creator.firstName : 'Swann') + (creator?.lastName ? creator?.lastName : 'Brunet')
        }`}</div>
      </div>
    </div>
  );
};

export default VideoBox;