import React, { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';
import { useSocket, ChatMessage, Reaction } from '../../hooks/useSocket';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface ChatProps {
  trackId: string;
  userId: string;
  username: string;
  isSpeaker?: boolean;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

const Chat: React.FC<ChatProps> = ({
  trackId,
  userId,
  username,
  isSpeaker = false,
}) => {
  const { t } = useTranslation();
  const [inputMessage, setInputMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
    null,
  );
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isConnected,
    sendMessage,
    deleteMessage,
    editMessage,
    addReaction,
    removeReaction,
  } = useSocket({
    trackId,
    username,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        reactionPickerRef.current &&
        !reactionPickerRef.current.contains(event.target as Node)
      ) {
        setShowReactionPicker(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && isConnected) {
      sendMessage(inputMessage, userId);
      setInputMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim() && isConnected) {
        sendMessage(inputMessage, userId);
        setInputMessage('');
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);

    // Auto-resize textarea
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset to minimum height first to get proper scrollHeight
      textarea.style.height = '48px';
      const newHeight = Math.max(48, Math.min(textarea.scrollHeight, 120));
      textarea.style.height = newHeight + 'px';

      // Show/hide scroll based on content height
      if (textarea.scrollHeight > 120) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }
    }
  };

  // Reset textarea height when message is sent
  useEffect(() => {
    if (inputMessage === '' && textareaRef.current) {
      textareaRef.current.style.height = '48px';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [inputMessage]);

  const formatTimestamp = (timestamp: Date) => {
    return format(new Date(timestamp), 'HH:mm');
  };

  const handleDelete = (messageId: string) => {
    if (window.confirm(t('chat.confirmDelete'))) {
      deleteMessage(messageId, userId, isSpeaker);
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.message);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveEdit = (messageId: string) => {
    if (editContent.trim()) {
      editMessage(messageId, userId, editContent.trim());
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    messageId: string,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit(messageId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleReactionClick = (messageId: string, emoji: string) => {
    const message = messages.find((m) => m.id === messageId);
    const reaction = message?.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = reaction?.userIds.includes(userId);

    if (hasReacted) {
      removeReaction(messageId, userId, emoji);
    } else {
      addReaction(messageId, userId, emoji);
    }
    setShowReactionPicker(null);
  };

  const canDelete = (msg: ChatMessage) => {
    return msg.userId === userId || isSpeaker;
  };

  const canEdit = (msg: ChatMessage) => {
    return msg.userId === userId;
  };

  const renderReactions = (msg: ChatMessage) => {
    if (!msg.reactions || msg.reactions.length === 0) return null;

    return (
      <div className={styles.reactionsContainer}>
        {msg.reactions.map((reaction: Reaction) => {
          const hasReacted = reaction.userIds.includes(userId);
          return (
            <button
              key={reaction.emoji}
              className={`${styles.reactionBadge} ${hasReacted ? styles.reactionBadgeActive : ''}`}
              onClick={() => handleReactionClick(msg.id, reaction.emoji)}
              title={`${reaction.count} ${reaction.emoji}`}
            >
              <span className={styles.reactionEmoji}>{reaction.emoji}</span>
              <span className={styles.reactionCount}>{reaction.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.chatWrapper}>
      <div className={styles.chatContainer}>
        <div className={styles.messagesContainer} ref={messagesContainerRef}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>{t('noChatMessages')}</div>
          ) : (
            messages.map((msg: ChatMessage) => (
              <div
                key={msg.id}
                className={`${styles.message} ${
                  msg.userId === userId ? styles.ownMessage : ''
                }`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => {
                  setHoveredMessageId(null);
                  if (showReactionPicker === msg.id) {
                    setShowReactionPicker(null);
                  }
                }}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.username}>
                    {msg.userId === userId ? 'Moi' : msg.username}
                  </span>
                  <span className={styles.timestamp}>
                    {formatTimestamp(msg.timestamp)}
                    {msg.editedAt && (
                      <span className={styles.editedIndicator}>
                        {' '}
                        {t('chat.messageEdited')}
                      </span>
                    )}
                  </span>
                </div>

                {editingMessageId === msg.id ? (
                  <div className={styles.editContainer}>
                    <textarea
                      className={styles.editTextarea}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, msg.id)}
                      autoFocus
                    />
                    <div className={styles.editActions}>
                      <button
                        className={styles.editButton}
                        onClick={() => handleSaveEdit(msg.id)}
                      >
                        {t('chat.saveEdit')}
                      </button>
                      <button
                        className={styles.cancelButton}
                        onClick={handleCancelEdit}
                      >
                        {t('chat.cancelEdit')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.messageContent}>{msg.message}</div>
                    {renderReactions(msg)}
                  </>
                )}

                {/* Action buttons */}
                {hoveredMessageId === msg.id && editingMessageId !== msg.id && (
                  <div className={styles.messageActions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => setShowReactionPicker(msg.id)}
                      title={t('chat.addReaction')}
                    >
                      😀
                    </button>
                    {canEdit(msg) && (
                      <button
                        className={styles.actionButton}
                        onClick={() => handleStartEdit(msg)}
                        title={t('chat.editMessage')}
                      >
                        ✏️
                      </button>
                    )}
                    {canDelete(msg) && (
                      <button
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => handleDelete(msg.id)}
                        title={t('chat.deleteMessage')}
                      >
                        🗑️
                      </button>
                    )}

                    {/* Reaction picker */}
                    {showReactionPicker === msg.id && (
                      <div
                        className={styles.reactionPicker}
                        ref={reactionPickerRef}
                      >
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            className={styles.reactionPickerButton}
                            onClick={() => handleReactionClick(msg.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.inputContainer}>
        <textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? `${t('writeMessage')}` : t('connecting')}
          disabled={!isConnected}
          className={styles.messageInput}
          maxLength={500}
          rows={1}
        />
        <button
          type="submit"
          disabled={!isConnected || !inputMessage.trim()}
          className={styles.sendButton}
          aria-label={t('send')}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default Chat;
