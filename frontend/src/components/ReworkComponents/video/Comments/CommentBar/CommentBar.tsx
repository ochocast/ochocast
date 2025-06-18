import React, { useState } from 'react';
import styles from './CommentBar.module.css';

interface CommentBarProps {
onSubmit: (text: string) => void;
}

const CommentBar: React.FC<CommentBarProps> = ({ onSubmit }) => {
const [comment, setComment] = useState('');

const handleSubmit = () => {
if (comment.trim()) {
onSubmit(comment.trim());
setComment('');
}
};

return (
<div className={styles.addCommentContainer}>
<input
type="text"
placeholder="Votre réponse ..."
value={comment}
onChange={(e) => setComment(e.target.value)}
className={styles.input}
/>
<button onClick={handleSubmit} className={styles.button}>
Envoyer
</button>
</div>
);
};

export default CommentBar;