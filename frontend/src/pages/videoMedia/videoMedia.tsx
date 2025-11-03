import React, { useEffect, useState, FC } from 'react';
import styles from './videoMedia.module.css';
import ReactMarkdown from 'react-markdown';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import {
  createComment,
  getComments,
  getMedia,
  getUsers,
  getVideo,
  getVideoSuggestions,
} from '../../utils/api';
import { useNavigate, useParams } from 'react-router-dom';
import { CommentObject, User, Video } from '../../utils/VideoProperties';
import NotFoundPage from '../notFound/notFound';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Tag from '../../components/ReworkComponents/generic/Tag/Tag';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import Vues from '../../../src/assets/vues.svg';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { t } from 'i18next';
import Commentary, {
  CommentaryDescriptionState,
} from '../../components/ReworkComponents/video/Comments/Commentary/Commentary';
import CommentReplyPanel from '../../components/ReworkComponents/video/Comments/Commentary/CommentReplyPanel';
import CommentBar from '../../components/ReworkComponents/video/Comments/CommentBar/CommentBar';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import { Root, RootContent } from 'mdast';

const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const VideoMedia: FC = () => {
  const [replyPanelOpen, setReplyPanelOpen] = useState(false);
  const [activeCommentIndex, setActiveCommentIndex] = useState<number | null>(
    null,
  );
  const [parentCommentId, setParentCommentId] = useState<string | null>(null);
  const [activeParent, setActiveParent] = useState<CommentObject | null>(null);
  const [conversations, setConversations] = useState<{
    [key: number]: Array<{
      sender: string;
      content: string;
      avatar?: string;
      created_at?: Date;
      email?: string;
    }>;
  }>({});

  const { videoId } = useParams();
  const [url, setUrl] = useState<string>('');
  const [video, setVideo] = useState<Video>();
  const [suggestedVideos, setSuggestedVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentaryList, setCommentaryList] = useState<CommentObject[]>([]);
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const userString = localStorage.getItem('backendUser');

  const linkExpirationTime = 3600;
  const renewalThreshold = 300;
  const PERSONA_IMAGE = '/branding/persona.png';

  const renewSignedUrl = async () => {
    const url_response = await getMedia(videoId);
    if (url_response) setUrl(url_response.data);
  };

  const removeH1 = () => {
    return (tree: Root) => {
      if (!tree || !tree.children) return;
      tree.children = tree.children.filter(
        (node: RootContent) => !(node.type === 'heading' && node.depth === 1),
      );
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      const backendUser = JSON.parse(userString!);
      const userResponse = await getUsers();
      const users: User[] = userResponse.data.users || [];
      const user = users.find((u) => u.id === backendUser.id);
      setCurrentUser(user || null);

      const [videoRes, mediaRes, commentsRes] = await Promise.all([
        getVideo(videoId),
        getMedia(videoId),
        getComments(videoId),
      ]);

      if (videoRes) {
        const currentVideo = videoRes.data[0];
        setVideo(currentVideo);

        const suggestionsRes = await getVideoSuggestions(currentVideo.id);
        if (suggestionsRes) {
          setSuggestedVideos(suggestionsRes.data.slice(0, 3));
        }
      }

      if (mediaRes) setUrl(mediaRes.data);
      if (commentsRes) setCommentaryList(commentsRes.data);

      setIsLoading(false);
    };

    fetchData();
    window.scrollTo(0, 0);
  }, [userString, videoId]);

  setTimeout(renewSignedUrl, (linkExpirationTime - renewalThreshold) * 1000);

  const handleReplyClick = (index: number) => {
    const parent = commentaryList.filter((c) => c.parentid === null)[index];
    if (!parent) return;

    setActiveCommentIndex(index);
    setParentCommentId(parent.id);
    setActiveParent(parent);

    const childComments = commentaryList
      .filter((c) => c.parentid === parent.id)
      .map((c) => ({
        sender: `${c.creator.firstName} ${c.creator.lastName}`,
        content: c.content,
        avatar: `${
          currentUser ? currentUser.picture_id || PERSONA_IMAGE : PERSONA_IMAGE
        }`,
        created_at: c.createdAt,
        email: c.creator.email,
      }));

    setConversations((prev) => ({
      ...prev,
      [index]: childComments,
    }));

    setReplyPanelOpen(true);
  };

  const handleCloseReplyPanel = () => {
    setReplyPanelOpen(false);
    setActiveCommentIndex(null);
    setParentCommentId(null);
    setActiveParent(null);
  };

  const handleSendReply = async (msg: string) => {
    if (activeCommentIndex === null || !videoId || !video) return;
    const backendUser = localStorage.getItem('backendUser');
    if (!backendUser) {
      alert('Vous devez être connecté pour répondre à un commentaire.');
      return;
    }
    const user = JSON.parse(backendUser);
    if (!user.id) {
      alert('Erreur utilisateur : id manquant.');
      return;
    }

    await createComment({
      video: video,
      content: msg,
      creator: user.id,
      parentid: parentCommentId,
    });

    const refreshed = await getComments(videoId);
    if (refreshed) {
      setCommentaryList(refreshed.data);

      const parent = refreshed.data.filter(
        (c: CommentObject) => c.parentid === null,
      )[activeCommentIndex];
      if (parent) {
        const childComments = refreshed.data
          .filter((c: CommentObject) => c.parentid === parent.id)
          .map((c: CommentObject) => ({
            sender: `${c.creator.firstName} ${c.creator.lastName}`,
            content: c.content,
            avatar: `${
              currentUser
                ? currentUser.picture_id || PERSONA_IMAGE
                : PERSONA_IMAGE
            }`,
            created_at: c.createdAt,
            email: c.creator.email,
          }));

        setConversations((prev) => ({
          ...prev,
          [activeCommentIndex]: childComments,
        }));
      }
    }
  };

  if (isLoading) return <LoadingCircle />;
  if (!video) return <NotFoundPage />;

  const formattedDate = new Date(video.createdAt);
  const backendUser = localStorage.getItem('backendUser');
  const currentUserId = backendUser ? JSON.parse(backendUser).id : null;
  const canEdit = currentUserId === video.creator.id;

  const handleProfileClick = () => {
    navigate(`/profile/${video.creator.firstName}`);
  };

  return (
    <div className={styles.containerGlobal}>
      <h2 className={styles.video_title}>
        {video.title}
        <span className={styles.vues}>
          <img className={styles.icons} src={Vues} alt="Vue icon" />
          &nbsp;{video.views}
        </span>
      </h2>

      <h4 className={styles.tagList}>
        Tags :
        {video.tags?.map((tag, id) => (
          <Tag key={id} content={tag.name} />
        ))}
      </h4>

      <div className={styles.buttonList}>
        {canEdit && (
          <Button
            type={ButtonType.primary}
            label={t('modifyVideo')}
            onClick={() => navigate(`/video/video-settings/${video.id}`)}
          />
        )}
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
              <ReactMarkdown remarkPlugins={[removeH1()]}>
                {video.description || ''}
              </ReactMarkdown>
            </div>

            <h3 className={styles.video_date}>
              Publié le :
              <br />
              {`${formattedDate.getDate().toString().padStart(2, '0')}/${(
                formattedDate.getMonth() + 1
              )
                .toString()
                .padStart(2, '0')}/${formattedDate.getFullYear()}`}
            </h3>
          </div>

          <div
            className={styles.profileDescription}
            onClick={handleProfileClick}
            style={{ cursor: 'pointer' }}
            title={`Voir le profil de ${video.creator.firstName} ${video.creator.lastName}`}
          >
            <ProfileDescription
              firstname={`${video.creator.firstName} ${video.creator.lastName}`}
              lastname=""
              email={video.creator.email}
              description={video.creator.description}
              state={ProfileDescriptionState.standard}
            />
          </div>
        </div>
      </div>

      <div className={styles.containerOther}>
        <CommentReplyPanel
          open={replyPanelOpen}
          onClose={handleCloseReplyPanel}
          conversation={conversations[activeCommentIndex || 0] || []}
          parentComment={
            activeParent
              ? {
                  content: activeParent.content,
                  firstname: activeParent.creator.firstName,
                  lastname: activeParent.creator.lastName,
                }
              : undefined
          }
          onSend={handleSendReply}
        />

        <div className={styles.suggestionSide}>
          <div className={styles.miniatureList}>
            {suggestedVideos.map((vid) => (
              <div key={vid.id} className={styles.thumbnailWrapper}>
                <Thumbnail
                  Id={vid.id}
                  title={vid.title}
                  createBy={`${vid.creator.firstName} ${vid.creator.lastName}`}
                  views={vid.views}
                  createdAt={vid.createdAt.toString()}
                  tags={vid.tags.map((tag) => tag.name)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.commentSection}>
          <CommentBar
            onSubmit={async (text) => {
              if (!videoId) return;
              const backendUser = localStorage.getItem('backendUser');
              if (backendUser) {
                await createComment({
                  parentid: null,
                  video: video,
                  content: text,
                  creator: JSON.parse(backendUser).id,
                });
              }
              const refreshed = await getComments(videoId);
              if (refreshed) setCommentaryList(refreshed.data);
            }}
          />
          <div className={styles.commentaryContainer}>
            {Array.isArray(commentaryList) &&
              commentaryList
                .filter((comment) => comment.parentid === null)
                .map((comment, index) => (
                  <Commentary
                    key={comment.id}
                    content={comment.content}
                    firstname={comment.creator.firstName}
                    lastname={comment.creator.lastName}
                    email={comment.creator.email}
                    created_at={comment.createdAt}
                    onReplyClick={() => handleReplyClick(index)}
                    state={CommentaryDescriptionState.standard}
                  />
                ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoMedia;
