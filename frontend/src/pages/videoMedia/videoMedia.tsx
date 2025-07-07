import React, { useEffect, useState, FC } from 'react';
import styles from './videoMedia.module.css';
import ReactMarkdown from 'react-markdown';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import {
  createComment,
  getComments,
  getMedia,
  getVideo,
} from '../../utils/api';
import { useNavigate, useParams } from 'react-router-dom';
import { CommentObject, Video } from '../../utils/VideoProperties';
import NotFoundPage from '../notFound/notFound';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Tag from '../../components/ReworkComponents/generic/Tag/Tag';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import Vues from '../../../src/assets/vues.svg';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { t } from 'i18next';
import Commentary from '../../components/ReworkComponents/video/Comments/Commentary/Commentary';
import CommentBar from '../../components/ReworkComponents/video/Comments/CommentBar/CommentBar';

const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const PERSONA_IMAGE = '/persona.png';

const VideoMedia: FC = () => {
  const { videoId } = useParams();
  const [url, setUrl] = useState<string>('');
  const [video, setVideo] = useState<Video>();
  const [isLoading, setIsLoading] = useState(false);
  const [commentaryList, setCommentaryList] = useState<CommentObject[]>([]);
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
      const response = await getComments(videoId);
      if (response !== undefined) setCommentaryList(response.data);
      console.log(commentaryList);
      const video_response = await getVideo(videoId);
      const url_response = await getMedia(videoId);
      if (url_response) setUrl(url_response.data);
      if (video_response) setVideo(video_response.data[0]);
      setIsLoading(false);
    };
    getMe();

    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); //disabled this line because adding commentary list or removing videoId reload the page infinitely

  setTimeout(renewSignedUrl, (linkExpirationTime - renewalThreshold) * 1000);

  if (isLoading) return <LoadingCircle />;

  if (video)
    return (
      <div className={styles.containerGlobal}>
        <h2 className={styles.video_title}>
          {video?.title}
          &nbsp;&nbsp;
          <span className={styles.vues}>
            <img className={styles.icons} src={Vues} alt="Vue icon" />
            &nbsp;
            {video?.views}
          </span>
        </h2>
        <h4 className={styles.tagList}>
          Tags :
          {video.tags &&
            video.tags.map((tag, id) => <Tag key={id} content={tag.name} />)}
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
              <h3 className={styles.video_description_title}>Description :</h3>
              <div className={styles.video_description}>
                <ReactMarkdown>{video.description || ''}</ReactMarkdown>
              </div>

              <h3 className={styles.video_date}>
                <>
                  {t('publishedOn')} :<br />
                  {video?.createdAt.toString()[8]}
                  {video?.createdAt.toString()[9]}/
                  {video?.createdAt.toString()[5]}
                  {video?.createdAt.toString()[6]}/
                  {video?.createdAt.toString()[0]}
                  {video?.createdAt.toString()[1]}
                  {video?.createdAt.toString()[2]}
                  {video?.createdAt.toString()[3]}
                </>
              </h3>
            </div>
            <div className={styles.profileDescription}>
              <ProfileDescription
                firstname={
                  video.creator.firstName + ' ' + video.creator.lastName
                }
                lastname=""
                email={video.creator.email}
                description={video.creator.description}
                image={PERSONA_IMAGE}
                state={ProfileDescriptionState.standard}
              />
            </div>
          </div>
        </div>
        <CommentBar
          onSubmit={async (text) => {
            if (!videoId) return;
            const backendUser = localStorage.getItem('backendUser');
            if (backendUser !== null && backendUser !== undefined) {
              await createComment({
                video: video,
                content: text,
                creator: JSON.parse(backendUser).id,
              });
            }
            const refreshed = await getComments(videoId);
            if (refreshed) setCommentaryList(refreshed.data);
          }}
        />
        <div className={styles.containerOther}>
          <div>
            <Card>
              <div className={styles.miniatureList}></div>
            </Card>
          </div>
          <div className={styles.commentaryContainer}>
            {Array.isArray(commentaryList) &&
              commentaryList.map((comment, index) => (
                <Commentary
                  key={index}
                  content={comment.content}
                  firstname={comment.creator.firstName}
                  lastname={comment.creator.lastName}
                  created_at={comment.createdAt}
                />
              ))}
          </div>
        </div>
      </div>
    );

  return <NotFoundPage />;
};

export default VideoMedia;
