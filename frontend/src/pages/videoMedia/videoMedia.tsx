import React, { useEffect } from 'react';
import { useState } from 'react';
import styles from './videoMedia.module.css';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import { FC } from 'react';
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
import Button, {ButtonType} from '../../components/ReworkComponents/generic/Button/Button';
import { useTranslation } from 'react-i18next';
// import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
// import Commentary from '../../components/ReworkComponents/Commentary/Commentary';
const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

interface VideoMediaProps {}

// const commentaryList = [
//   "Superbe video, j'ai adoré, merci pour le partage",
//   "J'ai adoré la créativité de la réalisation !",
//   'Le contenu est clair et intéressant !',
//   "Superbe video, j'ai adoré, merci pour le partage",
//   "J'ai adoré la créativité de la réalisation !",
//   'Le contenu est clair et intéressant !',
//   "Superbe video, j'ai adoré, merci pour le partage",
//   "J'ai adoré la créativité de la réalisation !",
//   'Le contenu est clair et intéressant !',
//   "Superbe video, j'ai adoré, merci pour le partage",
//   "J'ai adoré la créativité de la réalisation !",
//   'Le contenu est clair et intéressant !',
// ];

const VideoMedia: FC<VideoMediaProps> = () => {
  const { t } = useTranslation();
  const { videoId } = useParams();
  const [url, setUrl] = useState<string>('');
  const [video, setVideo] = useState<Video>();
  const [isLoading, setIsLoading] = useState(false);
  // Durée d'expiration en secondes, doit etre equivalent a la durée mise en backend
  const linkExpirationTime = 3600;
  const renewalThreshold = 300;
  const navigate = useNavigate();

  const renewSignedUrl = async () => {
    const url_response = await getMedia(videoId);
    if (url_response != undefined) setUrl(url_response.data);
  };

  useEffect(() => {
    const getMe = async () => {
      setIsLoading(true);
      const video_response = await getVideo(videoId);
      const url_response = await getMedia(videoId);
      if (url_response != undefined) setUrl(url_response.data);
      if (video_response != undefined) setVideo(video_response.data[0]);
      setIsLoading(false);
    };
    getMe();

    window.scrollTo(0, 0);
  }, [videoId]);

  setTimeout(renewSignedUrl, (linkExpirationTime - renewalThreshold) * 1000);

  if (isLoading) {
    return LoadingCircle();
  }

  if (!video) {
    return <NotFoundPage />;
  }

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
            type={ButtonType.secondary}
            label={t('archiveVideo')}
            //onClick={() => video.onArchived!(video.id)}
          />
        
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
              controls={true}
              width="100%"
              height="100%"
              config={{
                file: {},
              }}
            />
          </div>
          <div className={styles.containerPlayerRight}>
            <div className={styles.video_information}>
              <h3 className={styles.video_description_title}>
                Description :
              </h3>
              <p className={styles.video_description}>{video?.description}</p>
              
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
                name={video.creator.firstName + ' ' + video.creator.lastName}
                email={video.creator.email}
                description={video.creator.description}
                image="/persona.png"
                state={ProfileDescriptionState.standard}
              />
            </div>
          </div>
        </div>
        <div className={styles.containerOther}>
          <div>
            <Card>
              <div className={styles.miniatureList}>
              </div>
            </Card>
          </div>
          {/* <div className={styles.commentaryList}>
            {commentaryList.map((content, index) => (
              <Commentary key={index} content={content} />
            ))}
          </div> */}
        </div>
      </div>
    );
};

export default VideoMedia;
