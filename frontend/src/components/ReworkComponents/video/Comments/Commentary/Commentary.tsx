import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Commentary.module.css';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../../profil/ProfileDescription/ProfileDescription';

export enum CommentaryDescriptionState {
  standard = 'standard',
  reply = 'reply',
}

export interface CommentaryProps {
  content: string;
  firstname: string;
  lastname: string;
  email: string;
  created_at: string | Date;
  onReplyClick?: () => void;
  state: CommentaryDescriptionState;
  replyPreview?: { mention: string; snippet: string } | null;
}

const Commentary = (props: CommentaryProps) => {
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

  const { t } = useTranslation();
  if (props.state === CommentaryDescriptionState.standard) {
    return (
      <div className={styles.commentaryStandard}>
        <div className={styles.profileSide}>
          <ProfileDescription
            firstname={props.firstname}
            lastname={props.lastname}
            email={props.email}
            description=""
            image=""
            state={ProfileDescriptionState.tiny}
          />
        </div>
        <div className={styles.commentBox}>
          <div className={styles.commentHeader}>
            <span className={styles.date}>{formattedDate}</span>
          </div>
          <p className={styles.text}>{props.content}</p>
          {props.onReplyClick && (
            <button className={styles.replyButton} onClick={props.onReplyClick}>
              {t('openDiscussion')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (props.state === CommentaryDescriptionState.reply) {
    return (
      <div className={styles.commentaryReply}>
        <div className={styles.profileSide}>
          <ProfileDescription
            firstname={props.firstname}
            lastname={props.lastname}
            email={props.email}
            description=""
            image=""
            state={ProfileDescriptionState.reply}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.replyMeta}>
            <strong className={styles.replyAuthor}>
              {props.firstname} {props.lastname}
            </strong>
            <span style={{ margin: '0 0.5em' }} />
            <span className={styles.replyDate}>{formattedDate}</span>
          </div>
          <div className={styles.replyContentBox}>
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
