import React, { useEffect, useState, FC } from 'react';
import styles from './videoMedia.module.css';
import ReactMarkdown from 'react-markdown';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { getMedia, getVideo } from '../../utils/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Video } from '../../utils/VideoProperties';
import NotFoundPage from '../notFound/notFound';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Tag from '../../components/ReworkComponents/generic/Tag/Tag';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import Vues from '../../../src/assets/vues.svg';
import Button, { ButtonType } from '../../components/ReworkComponents/generic/Button/Button';
import { t } from 'i18next';

const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const VideoMedia: FC = () => {
  const { videoId } = useParams();
  const [url, setUrl] = useState<string>('');
  const [video, setVideo] = useState<Video>();
  const [isLoading, setIsLoading] = useState(false);
  const linkExpirationTime = 3600;
  const renewalThreshold = 300;
  const navigate = useNavigate();

  const renewSignedUrl = async () => {
    const url_response = await getMedia(videoId);
    if (url_response) setUrl(url_response.data);
  };

  useEffect(() => {
    const getMe = async () => {
      setIsLoading(true);
      const video_response = await getVideo(videoId);
      const url_response = await getMedia(videoId);
      if (url_response) setUrl(url_response.data);
      if (video_response) setVideo(video_response.data[0]);
      setIsLoading(false);
    };
    getMe();

    window.scrollTo(0, 0);
  }, [videoId]);

  setTimeout(renewSignedUrl, (linkExpirationTime - renewalThreshold) * 1000);

  if (isLoading) return <LoadingCircle />;

  if (video)
    return (
      <div className={styles.containerGlobal}>
        <h2 className={styles.video_title}>
        {video?.title}
        &nbsp;&nbsp;
        <span className={styles.vues}>
          <img className={styles.icons} src={Vues} alt="Vue icon"/>
          &nbsp;
          {video?.views}
          </span>
        </h2>
        <h4 className={styles.tagList}>
          Tags :
          {video.tags && video.tags.map((tag, id) => <Tag key={id} content={tag.name} />)}
        </h4>
        <div className={styles.buttonList}>        
          <Button
            type={ButtonType.primary}
            label={t('modifyVideo')}
            onClick={() => navigate(`/video/video-settings/${video.id}`)}
          />
        </div>
        <div className={styles.containerPlayer}>
          <div className={styles.videoPlayer}>
            <ReactPlayer
              url={url}
              playing={false}
              controls
              width="100%"
              height="100%"
            />
          </div>
          <div className={styles.containerPlayerRight}>
            <div className={styles.video_information}>
              <h3 className={styles.video_description_title}>
                Description :
              </h3>
              <div className={styles.video_description}>
                <ReactMarkdown>{video.description || ''}</ReactMarkdown>
              </div>
              
              <h3 className={styles.video_date}>
                Publié le :
              <br/> 
                {video?.createdAt.toString()[8]}{video?.createdAt.toString()[9]}/
                {video?.createdAt.toString()[5]}{video?.createdAt.toString()[6]}/
                {video?.createdAt.toString()[0]}{video?.createdAt.toString()[1]}{video?.createdAt.toString()[2]}{video?.createdAt.toString()[3]}
              </h3>
            </div>
            <div className={styles.profileDescription}>
              <ProfileDescription
                name={`${video.creator.firstName} ${video.creator.lastName}`}
                email={video.creator.email}
                description={video.creator.description}
                image="/persona.png"
                state={ProfileDescriptionState.standard}
              />
            </div>
          </div>
        </div>
        <div className={styles.containerOther}>
          <Card>
            <div className={styles.miniatureList}></div>
          </Card>
        </div>
      </div>
    );

  return <NotFoundPage />;
};

export default VideoMedia;