import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Commentary.module.css';
import { ReactComponent as HeartIcon } from '../../../../../assets/heart.svg';
import {
  likeComment,
  unlikeComment,
  userLikeComment,
  userUnlikeComment,
} from '../../../../../utils/api';

import ProfileDescription, {
  ProfileDescriptionState,
} from '../../../profil/ProfileDescription/ProfileDescription';
import { useNavigate } from 'react-router-dom';

export enum CommentaryDescriptionState {
  standard = 'standard',
  reply = 'reply',
}

export interface CommentaryProps {
  id?: string;
  content: string;
  firstname: string;
  lastname: string;
  username: string;
  email: string;
  created_at: string | Date;
  onReplyClick?: () => void;
  state: CommentaryDescriptionState;
  replyPreview?: { mention: string; snippet: string } | null;
  likes?: number;
  isLiked?: boolean;
  onLikeChange?: () => void;
  replyCount?: number;
}

const Commentary = (props: CommentaryProps) => {
  const [isLiked, setIsLiked] = useState(props.isLiked || false);
  const [likeCount, setLikeCount] = useState(props.likes || 0);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    setIsLiked(props.isLiked || false);
    setLikeCount(props.likes || 0);
  }, [props.isLiked, props.likes]);

  const createdAtDate =
    props.created_at instanceof Date
      ? props.created_at
      : new Date(props.created_at);

  const formattedDate = createdAtDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleLikeClick = async () => {
    if (isLoading || !props.id) return;

    const previousIsLiked = isLiked;
    const previousLikeCount = likeCount;

    setIsLiked(!isLiked);
    setLikeCount(isLiked ? Math.max(0, likeCount - 1) : likeCount + 1);
    setIsLoading(true);

    try {
      if (previousIsLiked) {
        const [commentResponse, userResponse] = await Promise.all([
          unlikeComment(props.id),
          userUnlikeComment(props.id),
        ]);
        if (!commentResponse.ok || !userResponse.ok) {
          setIsLiked(previousIsLiked);
          setLikeCount(previousLikeCount);
          console.error('Failed to unlike comment');
        } else if (props.onLikeChange) {
          props.onLikeChange();
        }
      } else {
        const [commentResponse, userResponse] = await Promise.all([
          likeComment(props.id),
          userLikeComment(props.id),
        ]);
        if (!commentResponse.ok || !userResponse.ok) {
          setIsLiked(previousIsLiked);
          setLikeCount(previousLikeCount);
          console.error('Failed to like comment');
        } else if (props.onLikeChange) {
          props.onLikeChange();
        }
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      setIsLiked(previousIsLiked);
      setLikeCount(previousLikeCount);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // empêche le clic de se propager à d'autres boutons
    navigate(`/profile/${props.username}`);
  };

  if (props.state === CommentaryDescriptionState.standard) {
    return (
      <div className={styles.commentaryStandard}>
        <div
          className={styles.profileSide}
          onClick={handleProfileClick}
          style={{ cursor: 'pointer' }}
          title={`Voir le profil de ${props.firstname} ${props.lastname}`}
        >
          <ProfileDescription
            firstname={props.firstname}
            lastname={props.lastname}
            username={props.username}
            email={props.email}
            description=""
            image=""
            state={ProfileDescriptionState.reply}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.replyMeta}>
            <strong className={styles.replyAuthor}>
              {props.username || `${props.firstname} ${props.lastname}`}
            </strong>
            <span style={{ margin: '0 0.5em' }} />
            <span className={styles.replyDate}>{formattedDate}</span>
          </div>

          <div className={styles.commentBox}>
            <p className={styles.text}>{props.content}</p>
            <div className={styles.commentActions}>
              <div className={styles.actionsLeft}>
                {props.onReplyClick && (
                  <button
                    className={styles.replyButton}
                    onClick={props.onReplyClick}
                  >
                    {t('openDiscussion')}
                    {typeof props.replyCount === 'number' && (
                      <span className={styles.replyCount}>
                        {' '}
                        ({props.replyCount})
                      </span>
                    )}
                  </button>
                )}
              </div>
              <div className={styles.likeSection}>
                <span className={styles.likeCount}>{likeCount}</span>
                <button
                  className={styles.likeButton}
                  onClick={handleLikeClick}
                  aria-disabled={isLoading}
                  data-loading={isLoading ? 'true' : 'false'}
                >
                  <div
                    className={`${styles.heartWrapper} ${isLiked ? styles.liked : ''}`}
                  >
                    <HeartIcon className={styles.heartIcon} />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (props.state === CommentaryDescriptionState.reply) {
    return (
      <div className={styles.commentaryReply}>
        <div
          className={styles.profileSide}
          onClick={handleProfileClick}
          style={{ cursor: 'pointer' }}
          title={`Voir le profil de ${props.firstname} ${props.lastname}`}
        >
          <ProfileDescription
            firstname={props.firstname}
            lastname={props.lastname}
            username={props.username}
            email={props.email}
            description=""
            image=""
            state={ProfileDescriptionState.reply}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.replyMeta}>
            <strong className={styles.replyAuthor}>
              {props.username || `${props.firstname} ${props.lastname}`}
            </strong>
            <span style={{ margin: '0 0.5em' }} />
            <span className={styles.replyDate}>{formattedDate}</span>
          </div>

          <div className={styles.replyContentBox}>
            <div className={styles.replyTopBar}>
              <div className={styles.likeSection}>
                <span className={styles.likeCount}>{likeCount}</span>
                <button
                  className={styles.likeButton}
                  onClick={handleLikeClick}
                  aria-disabled={isLoading}
                  data-loading={isLoading ? 'true' : 'false'}
                >
                  <div
                    className={`${styles.heartWrapper} ${isLiked ? styles.liked : ''}`}
                  >
                    <HeartIcon className={styles.heartIcon} />
                  </div>
                </button>
              </div>
            </div>
            {props.replyPreview && (
              <div className={styles.replyDiscordBox}>
                <span className={styles.replyMention}>
                  {props.replyPreview.mention}
                </span>
                <span className={styles.replyDiscordContent}>
                  {props.replyPreview.snippet}
                </span>
              </div>
            )}

            <p className={styles.text}>{props.content}</p>

            {props.onReplyClick && (
              <button
                className={styles.discreetButton}
                onClick={props.onReplyClick}
              >
                {t('reply')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Commentary;
