// videoMedia.tsx
import React, { useCallback, useEffect, useState, FC, useRef } from 'react';
import styles from './videoMedia.module.css';
import ReactMarkdown from 'react-markdown';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import {
  createComment,
  getComments,
  getLikedComments,
  getSubtitle,
  getUsers,
  getVideo,
  getVideoSuggestions,
  incrementVideoViews,
} from '../../utils/api';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  CommentObject,
  User,
  Video,
  VideoProcessing,
} from '../../utils/VideoProperties';
import {
  filterReadyVideos,
  getStoredUserId,
  isVideoReady,
} from '../../utils/videoVisibility';
import { useVideoProcessing } from '../../hooks/useVideoProcessing';
import { urlFrom, useVideoMediaUrl } from '../../hooks/useVideoMediaUrl';
import { videoPlayerView } from '../../utils/videoProcessing';
import VideoProcessingStatus from '../../components/ReworkComponents/video/VideoProcessingStatus/VideoProcessingStatus';
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

const PERSONA_IMAGE = '/branding/persona.png';

interface HlsLevel {
  height?: number;
  name?: string;
}

interface HlsPlayer {
  levels: HlsLevel[];
  currentLevel: number;
  loadLevel: number;
  nextLevel: number;
  autoLevelEnabled: boolean;
}

interface QualityOption {
  level: number;
  label: string;
}

/** Suggestions and the end-screen next video must be playable right away. */
const playableSuggestions = (response?: {
  ok: boolean;
  data?: unknown;
}): Video[] =>
  response?.ok && Array.isArray(response.data)
    ? filterReadyVideos(response.data as Video[]).slice(0, 3)
    : [];

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

const removeH1 = () => {
  return (tree: Root) => {
    if (!tree || !tree.children) return;
    tree.children = tree.children.filter(
      (node: RootContent) => !(node.type === 'heading' && node.depth === 1),
    );
  };
};

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
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<Video>();
  const [suggestedVideos, setSuggestedVideos] = useState<Video[]>([]);
  // True until the first fetch settles: otherwise the page flashes "not found".
  const [isLoading, setIsLoading] = useState(true);
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

  const currentVideoId = video?.id;

  // Like fetchData below: answers for a video the viewer already left must not
  // land on the one shown now.
  useEffect(() => {
    let cancelled = false;
    // Not the previous video's flag while this one's is loading.
    setIsFavorite(false);
    const checkFavorite = async () => {
      try {
        if (currentVideoId) {
          const fav = await isVideoFavorite(currentVideoId);
          if (cancelled) return;
          setIsFavorite(!!fav);
        }
      } catch (err) {
        console.error('Error checking favorite status', err);
      }
    };
    checkFavorite();
    return () => {
      cancelled = true;
    };
  }, [currentVideoId]);

  useEffect(() => {
    let cancelled = false;
    const incrementViews = async () => {
      try {
        if (currentVideoId) {
          const viewedVideosKey = 'viewedVideos';
          const readViewedVideos = (): string[] =>
            JSON.parse(sessionStorage.getItem(viewedVideosKey) || '[]');

          if (!readViewedVideos().includes(currentVideoId)) {
            const result = await incrementVideoViews(currentVideoId);
            // Counted even if the viewer has left; read again, since another
            // video may have been recorded meanwhile.
            sessionStorage.setItem(
              viewedVideosKey,
              JSON.stringify([...readViewedVideos(), currentVideoId]),
            );
            if (cancelled) return;

            if (result?.data) {
              // The next video may be set in the same render, before the
              // cleanup above has run.
              setVideo((prevVideo) =>
                prevVideo?.id === currentVideoId
                  ? { ...prevVideo, views: result.data.views }
                  : prevVideo,
              );
            }

            const suggestionsRes = await getVideoSuggestions(currentVideoId);
            if (cancelled) return;
            setSuggestedVideos(playableSuggestions(suggestionsRes));
          }
        }
      } catch (err) {
        console.error('Error incrementing video views', err);
      }
    };
    incrementViews();
    return () => {
      cancelled = true;
    };
  }, [currentVideoId]);

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

  const playerRef = useRef<_ReactPlayer | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);

  const handlePlayerReady = (player: _ReactPlayer) => {
    const hls = player.getInternalPlayer('hls') as HlsPlayer | null;
    if (hls?.levels?.length) {
      setQualityOptions(
        hls.levels.map((level, index) => ({
          level: index,
          label:
            level.name ||
            (level.height ? `${level.height}p` : `Qualité ${index + 1}`),
        })),
      );
      setSelectedQuality(hls.autoLevelEnabled ? -1 : hls.currentLevel);
    } else {
      setQualityOptions([]);
      setSelectedQuality(-1);
    }

    if (subtitleUrl) {
      const videoElement = player.getInternalPlayer();
      if (videoElement?.textTracks) {
        setTimeout(() => {
          for (let i = 0; i < videoElement.textTracks.length; i++) {
            const track = videoElement.textTracks[i];
            console.log('Track', i, ':', track.kind, track.label, track.mode);
          }
        }, 1000);
      }
    }
  };

  const handleQualityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const level = Number(event.target.value);
    const hls = playerRef.current?.getInternalPlayer('hls') as HlsPlayer | null;
    if (!hls) return;

    hls.loadLevel = level;
    hls.nextLevel = level;
    setSelectedQuality(level);
  };

  useEffect(() => {
    // The page stays mounted from one video to the next: answers for a video
    // the viewer already left must not land on the one shown now.
    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);

      const backendUser = userString ? JSON.parse(userString) : null;

      const userResponse = await getUsers();
      if (cancelled) return;
      const users: User[] = userResponse.data.users || [];
      const user = backendUser
        ? users.find((u) => u.id === backendUser.id)
        : null;
      setCurrentUser(user || null);

      const [videoRes, subtitleRes, commentsRes, likedCommentsRes] =
        await Promise.all([
          getVideo(videoId),
          getSubtitle(videoId),
          getComments(videoId),
          getLikedComments(),
        ]);
      if (cancelled) return;

      const currentVideo: Video | undefined = videoRes?.ok
        ? videoRes.data?.[0]
        : undefined;
      setVideo(currentVideo);
      if (currentVideo) {
        const suggestionsRes = await getVideoSuggestions(currentVideo.id);
        if (cancelled) return;
        setSuggestedVideos(playableSuggestions(suggestionsRes));
      }

      setSubtitleUrl(urlFrom(subtitleRes));

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
    };

    // A failed request must not leave the spinner on forever.
    fetchData()
      .catch((err) => console.error('Error loading video page', err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    window.scrollTo(0, 0);
    return () => {
      cancelled = true;
    };
  }, [userString, videoId]);

  const latestVideoIdRef = useRef(videoId);
  useEffect(() => {
    latestVideoIdRef.current = videoId;
  }, [videoId]);

  const handleProcessingFinal = useCallback(
    async (status: VideoProcessing, processedId: string) => {
      if (status.state === 'failed') {
        setVideo((prev) =>
          prev?.id === processedId
            ? { ...prev, transcoding_status: 'failed' }
            : prev,
        );
        return;
      }

      const [videoResponse, subtitleResponse] = await Promise.all([
        getVideo(processedId),
        getSubtitle(processedId),
      ]);
      if (latestVideoIdRef.current !== processedId) return;

      const refreshed: Video | undefined = videoResponse?.ok
        ? videoResponse.data?.[0]
        : undefined;
      setSubtitleUrl(urlFrom(subtitleResponse));
      // Ready: useVideoMediaUrl loads the media, with its retries.
      setVideo((prev) =>
        prev?.id === processedId
          ? { ...prev, ...refreshed, transcoding_status: 'ready' }
          : prev,
      );
    },
    [],
  );

  // Only the video this page shows, once its own data has loaded: the state of
  // the previous video never asks for, nor cancels, this one's media.
  const mediaReady = !!video && video.id === videoId && isVideoReady(video);
  const {
    url,
    unavailable: mediaUnavailable,
    retry: retryMediaUrl,
  } = useVideoMediaUrl(videoId, mediaReady);

  const viewerId = getStoredUserId();
  const isVideoCreator =
    !!viewerId && !!video?.creator && video.creator.id === viewerId;
  // Visitors only need to follow pending videos; a failed video's reason is
  // for its creator.
  const followProcessing =
    video?.transcoding_status === 'pending' ||
    (video?.transcoding_status === 'failed' && isVideoCreator);
  const { status: processing } = useVideoProcessing(currentVideoId, {
    enabled: followProcessing,
    onFinal: handleProcessingFinal,
  });

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

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.warn('exitFullscreen failed', e);
      }
    }

    setShowEndScreen(false);

    setIsPlaying(false);

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
  const playerView = videoPlayerView(video.transcoding_status, processing);

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
            {playerView !== 'player' ? (
              <VideoProcessingStatus
                status={processing}
                failed={playerView === 'failed'}
                isCreator={canEdit}
              />
            ) : !url ? (
              <div className={styles.playerLoading}>
                {mediaUnavailable ? (
                  <div className={styles.playerError} role="alert">
                    <p className={styles.playerErrorMessage}>
                      {t('videoMediaUnavailable')}
                    </p>
                    <Button
                      type={ButtonType.primary}
                      label={t('retry')}
                      onClick={retryMediaUrl}
                    />
                  </div>
                ) : (
                  <span
                    className={styles.playerSpinner}
                    role="status"
                    aria-label={t('videoMediaLoading')}
                  />
                )}
              </div>
            ) : (
              <>
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
                  onReady={handlePlayerReady}
                  config={{
                    file: {
                      hlsOptions: {
                        startLevel: -1,
                        testBandwidth: true,
                        capLevelToPlayerSize: true,
                        abrEwmaDefaultEstimate: 3000000,
                      },
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
                {qualityOptions.length > 1 && (
                  <label className={styles.qualityControl}>
                    <span>Qualité</span>
                    <select
                      aria-label="Qualité vidéo"
                      value={selectedQuality}
                      onChange={handleQualityChange}
                    >
                      <option value={-1}>Auto</option>
                      {qualityOptions.map((quality) => (
                        <option key={quality.level} value={quality.level}>
                          {quality.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

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
                    views={vid.views}
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
