import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './CommentReplyPanel.module.css';
import Commentary, { CommentaryDescriptionState } from './Commentary';

export interface CommentReplyPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: Array<{
    sender: string;
    content: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    description?: string;
    avatar?: string;
    created_at?: Date;
    replyTo?: {
      firstname: string;
      lastname: string;
      content: string;
    };
  }>;
  parentComment?: { content: string; firstname: string; lastname: string };
  onSend: (
    message: string,
    replyTo?: { firstname: string; lastname: string; content: string },
  ) => void;
}

const CommentReplyPanel: React.FC<CommentReplyPanelProps> = ({
  open,
  onClose,
  conversation,
  parentComment,
  onSend,
}) => {
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<null | {
    firstname: string;
    lastname: string;
    content: string;
  }>(null);
  const { t } = useTranslation();

  // 🔒 Bloquer le scroll du body + html quand le panel est ouvert
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // 🔧 Fonction pour extraire le contenu réel du message sans la preview
  const extractMessageContent = (content: string): string => {
    const lines = content.split('\n');
    // Si la première ligne commence par @, on la supprime (c'est la preview)
    if (lines[0].trim().startsWith('@')) {
      // Supprime aussi les lignes vides suivantes
      let startIdx = 1;
      while (startIdx < lines.length && lines[startIdx].trim() === '') {
        startIdx++;
      }
      return lines.slice(startIdx).join('\n').trim();
    }
    return content;
  };

  // 🔧 Fonction pour extraire la preview du message
  const extractReplyPreview = (
    content: string,
  ): { mention: string; snippet: string } | null => {
    const lines = content.split('\n');
    if (lines[0].trim().startsWith('@')) {
      const firstLine = lines[0].trim();
      const match = firstLine.match(/^(@\S+\s+\S+)\s+(.*)$/);
      if (match) {
        return {
          mention: match[1],
          snippet: match[2],
        };
      }
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message, replyTo || undefined);
      setMessage('');
      setReplyTo(null);
    }
  };

  const handleReplyClick = (msg: {
    firstname: string;
    lastname: string;
    content: string;
  }) => {
    setReplyTo(msg);

    // Récupère le début du message (première ligne ou 60 caractères max)
    const firstLine = msg.content.split('\n')[0];
    const snippet =
      firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;

    // Initialise le message avec @prenom nom + snippet + double retour à la ligne
    setMessage(`@${msg.firstname} ${msg.lastname} ${': ' + snippet}\n\n`);
  };

  return (
    <div className={styles.replyPanelOverlay}>
      <div className={styles.replyPanel}>
        <div className={styles.header}>
          {parentComment ? (
            <p className={styles.parentComment}>
              <strong>
                {parentComment.firstname} {parentComment.lastname}
              </strong>
              <br />
              {parentComment.content}
            </p>
          ) : (
            <span>{t('conversation')}</span>
          )}
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.messages}>
          {[...conversation].map((msg, idx, arr) => {
            const realMsg = arr[idx];

            // Extraire la preview si elle existe
            const replyPreview = extractReplyPreview(realMsg.content);
            const actualContent = extractMessageContent(realMsg.content);

            return (
              <div key={idx} className={styles.commentWrapper}>
                <Commentary
                  content={actualContent}
                  firstname={
                    realMsg.firstname || realMsg.sender.split(' ')[0] || ''
                  }
                  lastname={
                    realMsg.lastname ||
                    realMsg.sender.split(' ').slice(1).join(' ') ||
                    ''
                  }
                  email={realMsg.email || ''}
                  created_at={realMsg.created_at || new Date()}
                  onReplyClick={() =>
                    handleReplyClick({
                      firstname:
                        realMsg.firstname || realMsg.sender.split(' ')[0] || '',
                      lastname:
                        realMsg.lastname ||
                        realMsg.sender.split(' ').slice(1).join(' ') ||
                        '',
                      content: actualContent,
                    })
                  }
                  state={CommentaryDescriptionState.reply}
                  replyPreview={replyPreview}
                />
              </div>
            );
          })}
        </div>

        {replyTo && (
          <div className={styles.replyToBox}>
            <span className={styles.replyToLabel}>
              {t('replyTo')}{' '}
              <strong className={styles.replyToName}>
                {'@' + replyTo.firstname} {replyTo.lastname}
              </strong>
            </span>
            <button
              className={styles.replyToCloseBtn}
              type="button"
              aria-label={t('cancelReply')}
              onClick={() => {
                setReplyTo(null);
                setMessage('');
              }}
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.inputRow}>
          <input
            type="text"
            value={
              replyTo ? message.split('\n\n').slice(1).join('\n\n') : message
            }
            onChange={(e) => {
              if (replyTo) {
                const firstLine = message.split('\n\n')[0];
                setMessage(`${firstLine}\n\n${e.target.value}`);
              } else {
                setMessage(e.target.value);
              }
            }}
            placeholder={t('yourReplyPlaceholder')}
            className={styles.input}
          />
          <button type="submit" className={styles.sendBtn}>
            {t('send')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentReplyPanel;
