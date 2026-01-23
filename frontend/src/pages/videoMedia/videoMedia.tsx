// videoMedia.tsx
import React, { useEffect, useState, FC, useRef } from 'react';
import styles from './videoMedia.module.css';
import ReactMarkdown from 'react-markdown';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import {
  createComment,
  getComments,
  getLikedComments,
  getMedia,
  getSubtitle,
  getUsers,
  getVideo,
  getVideoSuggestions,
} from '../../utils/api';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CommentObject, User, Video } from '../../utils/VideoProperties';
import NotFoundPage from '../notFound/notFound';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Tag from '../../components/ReworkComponents/generic/Tag/Tag';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import FavorisFilterNotSelected from '../../assets/FavorisFilterNotSelected.svg';
import FavorisFilterSelected from '../../assets/FavorisFilterSelected.svg';
import {
  addToFavorites,
  removeFromFavorites,
  isVideoFavorite,
} from '../../utils/api';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useTranslation } from 'react-i18next';
import Commentary, {
  CommentaryDescriptionState,
} from '../../components/ReworkComponents/video/Comments/Commentary/Commentary';
import CommentReplyPanel from '../../components/ReworkComponents/video/Comments/Commentary/CommentReplyPanel';
import CommentBar from '../../components/ReworkComponents/video/Comments/CommentBar/CommentBar';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import { Root, RootContent } from 'mdast';
import CopyButtonIcon from '../../assets/copy.svg';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';

const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const VideoMedia: FC = () => {
  const { t } = useTranslation();
  const [replyPanelOpen, setReplyPanelOpen] = useState(false);
  const [parentCommentId, setParentCommentId] = useState<string | null>(null);
  const [activeParent, setActiveParent] = useState<CommentObject | null>(null);
  const [conversations, setConversations] = useState<{
    [key: string]: Array<{
      id?: string;
      sender: string;
      content: string;
      avatar?: string;
      created_at?: Date;
      email?: string;
      likes?: number;
      isLiked?: boolean;
    }>;
  }>({});

  const { videoId } = useParams();
  const [url, setUrl] = useState<string>('');
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<Video>();
  const [suggestedVideos, setSuggestedVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentaryList, setCommentaryList] = useState<CommentObject[]>([]);
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const userString = localStorage.getItem('backendUser');

  const location = useLocation();
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    if (location.state?.toast) {
      setToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    const timer = setTimeout(() => setToast(null), 2000);

    return () => clearTimeout(timer);
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    const checkFavorite = async () => {
      try {
        if (video && video.id) {
          const fav = await isVideoFavorite(video.id);
          setIsFavorite(!!fav);
        }
      } catch (err) {
        console.error('Error checking favorite status', err);
      }
    };
    checkFavorite();
    // we intentionally do not include isVideoFavorite in deps
  }, [video]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!video || !video.id) return;
      if (isFavorite) {
        await removeFromFavorites(video.id);
        setIsFavorite(false);
      } else {
        await addToFavorites(video.id);
        setIsFavorite(true);
      }
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const linkExpirationTime = 3600;
  const renewalThreshold = 300;
  const PERSONA_IMAGE = '/branding/persona.png';

  // ✅ Player / end screen
  const playerRef = useRef<_ReactPlayer | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);

  const sortCommentsByLikes = (comments: CommentObject[]): CommentObject[] => {
    const parentComments = comments.filter((c) => c.parentid === null);
    const childComments = comments.filter((c) => c.parentid !== null);

    parentComments.sort((a, b) => {
      const likesA = a.likes || 0;
      const likesB = b.likes || 0;

      if (likesB !== likesA) return likesB - likesA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return [...parentComments, ...childComments];
  };

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

      const backendUser = userString ? JSON.parse(userString) : null;

      const userResponse = await getUsers();
      const users: User[] = userResponse.data.users || [];
      const user = backendUser
        ? users.find((u) => u.id === backendUser.id)
        : null;
      setCurrentUser(user || null);

      const [videoRes, mediaRes, subtitleRes, commentsRes, likedCommentsRes] =
        await Promise.all([
          getVideo(videoId),
          getMedia(videoId),
          getSubtitle(videoId),
          getComments(videoId),
          getLikedComments(),
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

      if (subtitleRes && subtitleRes.data) {
        setSubtitleUrl(subtitleRes.data);
      } else {
        setSubtitleUrl(null);
      }

      if (commentsRes && likedCommentsRes) {
        const likedComments = Array.isArray(likedCommentsRes.data)
          ? likedCommentsRes.data
          : [];
        const likedCommentIds = new Set(
          likedComments.map((c: CommentObject) => c.id),
        );

        const commentsWithLikedStatus = commentsRes.data.map(
          (comment: CommentObject) => ({
            ...comment,
            isLiked: likedCommentIds.has(comment.id),
          }),
        );

        setCommentaryList(sortCommentsByLikes(commentsWithLikedStatus));
      } else if (commentsRes) {
        setCommentaryList(commentsRes.data);
      }

      setIsLoading(false);
    };

    fetchData();
    window.scrollTo(0, 0);
  }, [userString, videoId]);

  // ✅ renew signed url (avoid re-arming every render)
  useEffect(() => {
    const ms = (linkExpirationTime - renewalThreshold) * 1000;
    const id = window.setTimeout(renewSignedUrl, ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const handleReplyClick = (index: number) => {
    const parent = commentaryList.filter((c) => c.parentid === null)[index];
    if (!parent) return;

    setParentCommentId(parent.id);
    setActiveParent(parent);

    const childComments = commentaryList
      .filter((c) => c.parentid === parent.id)
      .map((c) => ({
        id: c.id,
        sender:
          c.creator.username || `${c.creator.firstName} ${c.creator.lastName}`,
        content: c.content,
        avatar: `${
          currentUser ? currentUser.picture_id || PERSONA_IMAGE : PERSONA_IMAGE
        }`,
        created_at: c.createdAt,
        email: c.creator.email,
        likes: c.likes || 0,
        isLiked: c.isLiked || false,
      }));

    setConversations((prev) => ({
      ...prev,
      [parent.id]: childComments,
    }));

    setReplyPanelOpen(true);
  };

  const handleCloseReplyPanel = () => {
    setReplyPanelOpen(false);
    setParentCommentId(null);
    setActiveParent(null);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setToast({
        message: 'Lien copié dans le presse-papiers',
        type: 'success',
      });
      setTimeout(() => setToast(null), 500);
    });
  };

  const handleReplyPanelLikeChange = async () => {
    if (!parentCommentId || !videoId) return;

    const commentsRes = await getComments(videoId);
    const likedCommentsRes = await getLikedComments();

    if (
      commentsRes &&
      likedCommentsRes &&
      Array.isArray(likedCommentsRes.data)
    ) {
      const likedCommentIds = new Set(
        likedCommentsRes.data.map((c: CommentObject) => c.id),
      );

      const commentsWithLikedStatus = commentsRes.data.map(
        (comment: CommentObject) => ({
          ...comment,
          isLiked: likedCommentIds.has(comment.id),
        }),
      );

      const sortedComments = sortCommentsByLikes(commentsWithLikedStatus);
      setCommentaryList(sortedComments);

      const parent = sortedComments.find(
        (c: CommentObject) => c.id === parentCommentId,
      );
      if (parent) {
        const currentConversation = conversations[parentCommentId] || [];
        const updatedConversation = currentConversation.map((msg) => {
          const freshComment = commentsWithLikedStatus.find(
            (c: CommentObject) => c.id === msg.id,
          );
          if (freshComment) {
            return {
              ...msg,
              likes: freshComment.likes || 0,
              isLiked: freshComment.isLiked || false,
            };
          }
          return msg;
        });

        setConversations((prev) => ({
          ...prev,
          [parentCommentId]: updatedConversation,
        }));
      }
    }
  };

  const handleSendReply = async (msg: string) => {
    if (!parentCommentId || !videoId || !video) return;

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

    const [refreshed, likedCommentsRes] = await Promise.all([
      getComments(videoId),
      getLikedComments(),
    ]);

    if (refreshed && likedCommentsRes) {
      const likedComments = Array.isArray(likedCommentsRes.data)
        ? likedCommentsRes.data
        : [];
      const likedCommentIds = new Set(
        likedComments.map((c: CommentObject) => c.id),
      );

      const commentsWithLikedStatus = refreshed.data.map(
        (comment: CommentObject) => ({
          ...comment,
          isLiked: likedCommentIds.has(comment.id),
        }),
      );

      const sortedComments = sortCommentsByLikes(commentsWithLikedStatus);
      setCommentaryList(sortedComments);

      const parent = sortedComments.find(
        (c: CommentObject) => c.id === parentCommentId,
      );
      if (parent) {
        const parentChildComments = commentsWithLikedStatus
          .filter((c: CommentObject) => c.parentid === parent.id)
          .map((c: CommentObject) => ({
            id: c.id,
            sender:
              c.creator?.username ||
              `${c.creator.firstName} ${c.creator.lastName}`,
            content: c.content,
            avatar: `${
              currentUser
                ? currentUser.picture_id || PERSONA_IMAGE
                : PERSONA_IMAGE
            }`,
            created_at: c.createdAt,
            email: c.creator.email,
            likes: c.likes || 0,
            isLiked: c.isLiked || false,
          }));

        setConversations((prev) => ({
          ...prev,
          [parentCommentId]: parentChildComments,
        }));
      }
    }
  };

  // ✅ End screen actions
  const handleVideoEnded = () => {
    setIsPlaying(false);
    setShowEndScreen(true);
  };

  const handleReplay = () => {
    setShowEndScreen(false);
    try {
      playerRef.current?.seekTo?.(0, 'seconds');
    } catch (e) {
      console.warn('seekTo failed', e);
    }
    setIsPlaying(true);
  };

  const handleGoToNextVideo = async () => {
    const next = suggestedVideos?.[0];
    if (!next?.id) return;

    // si on est en plein écran, on sort du fullscreen avant de changer de page
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.warn('exitFullscreen failed', e);
      }
    }

    setShowEndScreen(false);

    // reset local state pour pas garder l'overlay sur la vidéo suivante
    setIsPlaying(false);

    // ✅ navigation vers la vidéo suivante (1ère recommandation)
    navigate(`/video/${next.id}`);
  };

  if (isLoading) return <LoadingCircle />;
  if (!video) return <NotFoundPage />;

  const formattedDate = new Date(video.createdAt);

  const backendUser = localStorage.getItem('backendUser');
  const currentUserId = backendUser
    ? JSON.parse(backendUser)?.id || null
    : null;
  const canEdit = currentUserId === video.creator.id;

  const handleProfileClick = () => {
    const uname = video.creator?.username || video.creator.firstName;
    navigate(`/profile/${uname}`);
  };

  return (
    <div className={styles.containerGlobal}>
      <div className={styles.watchLayout}>
        {/* COLONNE PRINCIPALE */}
        <main className={styles.mainColumn}>
          {/* Player */}
          <div className={styles.playerWrapper}>
            <ReactPlayer
              ref={playerRef}
              url={url}
              playing={isPlaying}
              controls
              width="100%"
              height="100%"
              onPlay={() => {
                setIsPlaying(true);
                setShowEndScreen(false);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={handleVideoEnded}
              onReady={(player) => {
                console.log('▶️ ReactPlayer ready');
                if (subtitleUrl) {
                  const videoElement = player.getInternalPlayer();
                  if (videoElement && videoElement.textTracks) {
                    setTimeout(() => {
                      for (let i = 0; i < videoElement.textTracks.length; i++) {
                        const track = videoElement.textTracks[i];
                        console.log(
                          'Track',
                          i,
                          ':',
                          track.kind,
                          track.label,
                          track.mode,
                        );
                      }
                    }, 1000);
                  }
                }
              }}
              config={{
                file: {
                  attributes: {
                    crossOrigin: 'anonymous',
                  },
                  tracks: subtitleUrl
                    ? [
                        {
                          kind: 'subtitles',
                          src: subtitleUrl,
                          srcLang: 'fr',
                          label: 'Français',
                          default: false,
                        },
                      ]
                    : [],
                },
              }}
            />

            {/* ✅ END SCREEN OVERLAY (visible même en plein écran) */}
            {showEndScreen && (
              <div className={styles.endScreenOverlay}>
                <div className={styles.endScreenCard}>
                  <p className={styles.endScreenTitle}>
                    {t('lectureTerminée')}
                  </p>
                  {suggestedVideos?.[0] && (
                    <p className={styles.endScreenNextTitle}>
                      {t('recommandation')} :{' '}
                      <strong>{suggestedVideos[0].title}</strong>
                    </p>
                  )}
                  <div className={styles.endScreenActions}>
                    <button
                      type="button"
                      className={styles.endScreenBtnPrimary}
                      onClick={handleReplay}
                    >
                      {t('rejouer')}
                    </button>
                    <button
                      type="button"
                      className={styles.endScreenBtnSecondary}
                      onClick={handleGoToNextVideo}
                      disabled={!suggestedVideos?.[0]?.id}
                    >
                      {t('vidéoSuivante')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Titre + tags */}
          <section className={styles.titleBlock}>
            <div className={styles.titleLeft}>
              <h2 className={styles.video_title}>{video.title}</h2>
              <div className={styles.tagList}>
                <span className={styles.tagLabel}>Tags :</span>
                {video.tags?.map((tag, id) => (
                  <Tag key={id} content={tag.name} />
                ))}
              </div>
            </div>

            <div className={styles.titleRight}>
              <img
                className={`${styles.copyButtonIcon} ${styles.smallButton}`}
                src={CopyButtonIcon}
                alt="Partager les filtres"
                onClick={handleShare}
              />
            </div>
            <div className={styles.titleRight}>
              <img
                src={
                  isFavorite ? FavorisFilterSelected : FavorisFilterNotSelected
                }
                alt={isFavorite ? 'En favoris' : 'Ajouter aux favoris'}
                className={styles.favoriteIcon}
                onClick={toggleFavorite}
              />

              {canEdit && (
                <div className={styles.titleActions}>
                  <Button
                    type={ButtonType.primary}
                    label={t('modifyVideo')}
                    onClick={() =>
                      navigate(`/video/video-settings/${video.id}`)
                    }
                  />
                </div>
              )}
            </div>
          </section>

          {/* Ligne profil + actions */}
          <section className={styles.channelRow}>
            <div
              className={styles.profileDescription}
              onClick={handleProfileClick}
              style={{ cursor: 'pointer' }}
              title={`Voir le profil de ${
                video.creator?.username ||
                `${video.creator.firstName} ${video.creator.lastName}`
              }`}
            >
              <ProfileDescription
                firstname={`${video.creator.firstName} ${video.creator.lastName}`}
                lastname=""
                username={`${video.creator.username}`}
                email={video.creator.email}
                description={video.creator.description}
                state={ProfileDescriptionState.standard}
              />
            </div>
          </section>

          {/* Description + infos */}
          <section className={styles.descriptionBlock}>
            <h3 className={styles.video_description_title}> </h3>

            <div className={styles.video_description}>
              <ReactMarkdown remarkPlugins={[removeH1()]}>
                {video.description || ''}
              </ReactMarkdown>
            </div>

            {/* Orateurs (internal_speakers) */}
            {Array.isArray(video.internal_speakers) &&
              video.internal_speakers.length > 0 && (
                <p className={styles.video_metaLine}>
                  <strong>{t('orateurs')} :</strong>{' '}
                  {video.internal_speakers
                    .map((u) => `${u.firstName} ${u.lastName}`.trim())
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}

            {/* Intervenants externes (external_speakers) */}
            {video.external_speakers?.trim() && (
              <p className={styles.video_metaLine}>
                <strong>{t('intervenantsExternes')} :</strong>{' '}
                {video.external_speakers}
              </p>
            )}

            <h3 className={styles.video_date}>
              {t('publiéLe')} :
              <br />
              {`${formattedDate.getDate().toString().padStart(2, '0')}/${(
                formattedDate.getMonth() + 1
              )
                .toString()
                .padStart(2, '0')}/${formattedDate.getFullYear()}`}
            </h3>
          </section>

          {/* Commentaires */}
          <section className={styles.commentsBlock}>
            <CommentReplyPanel
              open={replyPanelOpen}
              onClose={handleCloseReplyPanel}
              conversation={conversations[parentCommentId || ''] || []}
              parentComment={
                activeParent
                  ? {
                      content: activeParent.content,
                      firstname: activeParent.creator.firstName,
                      lastname: activeParent.creator.lastName,
                      username: `${video.creator.username}`,
                    }
                  : undefined
              }
              onSend={handleSendReply}
              onLikeChange={handleReplyPanelLikeChange}
            />

            <CommentBar
              onSubmit={async (text) => {
                if (!videoId) return;
                const backendUser = localStorage.getItem('backendUser');
                if (backendUser) {
                  await createComment({
                    parentid: null,
                    video: video,
                    content: text,
                    creator: JSON.parse(backendUser)?.id || '',
                  });
                }

                const [refreshed, likedCommentsRes] = await Promise.all([
                  getComments(videoId),
                  getLikedComments(),
                ]);

                if (refreshed && likedCommentsRes) {
                  const likedCommentIds = new Set(
                    likedCommentsRes.data.map((c: CommentObject) => c.id),
                  );

                  const commentsWithLikedStatus = refreshed.data.map(
                    (comment: CommentObject) => ({
                      ...comment,
                      isLiked: likedCommentIds.has(comment.id),
                    }),
                  );

                  setCommentaryList(
                    sortCommentsByLikes(commentsWithLikedStatus),
                  );
                }
              }}
            />

            <div className={styles.commentaryContainer}>
              {Array.isArray(commentaryList) &&
                commentaryList
                  .filter((comment) => comment.parentid === null)
                  .map((comment, index) => {
                    const replyCount = commentaryList.filter(
                      (c) => c.parentid === comment.id,
                    ).length;

                    return (
                      <Commentary
                        key={comment.id}
                        id={comment.id}
                        content={comment.content}
                        firstname={comment.creator.firstName}
                        lastname={comment.creator.lastName}
                        username={comment.creator.username}
                        email={comment.creator.email}
                        created_at={comment.createdAt}
                        onReplyClick={() => handleReplyClick(index)}
                        state={CommentaryDescriptionState.standard}
                        likes={comment.likes || 0}
                        isLiked={comment.isLiked || false}
                        replyCount={replyCount}
                      />
                    );
                  })}
            </div>
          </section>
        </main>

        {/* SIDEBAR */}
        <aside className={styles.sideColumn}>
          <div className={styles.sideSticky}>
            <div className={styles.miniatureList} ref={suggestionsRef}>
              {suggestedVideos.map((vid) => (
                <div key={vid.id} className={styles.thumbnailWrapper}>
                  <Thumbnail
                    Id={vid.id}
                    title={vid.title}
                    createBy={
                      vid.creator?.username ||
                      `${vid.creator.firstName} ${vid.creator.lastName}`
                    }
                    createdAt={vid.createdAt.toString()}
                    tags={vid.tags.map((tag) => tag.name)}
                    duration={vid.duration}
                  />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default VideoMedia;
