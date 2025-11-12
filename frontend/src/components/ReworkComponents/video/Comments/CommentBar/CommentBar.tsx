import React, { useState } from 'react';
import styles from './CommentBar.module.css';
import { useTranslation } from 'react-i18next';

interface CommentBarProps {
  onSubmit: (text: string) => void;
}

const CommentBar: React.FC<CommentBarProps> = ({ onSubmit }) => {
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
    // Si Shift+Entrée, on laisse le comportement par défaut (retour à la ligne)
  };

  return (
    <div className={styles.addCommentContainer}>
      <textarea
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
};

export default CommentBar;
