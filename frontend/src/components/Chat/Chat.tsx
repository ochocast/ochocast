import React, { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';
import { useSocket, ChatMessage } from '../../hooks/useSocket';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface ChatProps {
  trackId: string;
  userId: string;
  username: string;
}

const Chat: React.FC<ChatProps> = ({ trackId, userId, username }) => {
  const { t } = useTranslation();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, isConnected, sendMessage } = useSocket({
    trackId,
    username,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // Reset height first to get proper scrollHeight
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 120);
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
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [inputMessage]);

  const formatTimestamp = (timestamp: Date) => {
    return format(new Date(timestamp), 'HH:mm');
  };

  return (
    <div className={styles.chatWrapper}>
      <div className={styles.chatContainer}>
        <div className={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>{t('noChatMessages')}</div>
          ) : (
            messages.map((msg: ChatMessage, index: number) => (
              <div
                key={index}
                className={`${styles.message} ${
                  msg.userId === userId ? styles.ownMessage : ''
                }`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.username}>
                    {msg.userId === userId ? 'Moi' : msg.username}
                  </span>
                  <span className={styles.timestamp}>
                    {formatTimestamp(msg.timestamp)}
                  </span>
                </div>
                <div className={styles.messageContent}>{msg.message}</div>
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
