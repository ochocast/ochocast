import React, { useState, forwardRef } from 'react';
import styles from './CommentBar.module.css';
import { useTranslation } from 'react-i18next';

interface CommentBarProps {
  onSubmit: (text: string) => void;
}

const CommentBar = forwardRef<HTMLTextAreaElement, CommentBarProps>(
  ({ onSubmit }, ref) => {
    const { t } = useTranslation();
    const [comment, setComment] = useState('');

    const handleSubmit = () => {
      if (comment.trim()) {
        onSubmit(comment.trim());
        setComment('');
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    return (
      <div className={styles.addCommentContainer}>
        <textarea
          ref={ref}
          placeholder={t('yourAnswer')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.input}
          rows={1}
        />
        <button onClick={handleSubmit} className={styles.button}>
          {t('sendComment')}
        </button>
      </div>
    );
  },
);

CommentBar.displayName = 'CommentBar';

export default CommentBar;
