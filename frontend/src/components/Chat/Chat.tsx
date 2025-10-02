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

  const formatTimestamp = (timestamp: Date) => {
    return format(new Date(timestamp), 'HH:mm');
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <h3>{t('liveChat')}</h3>
        <div className={styles.connectionStatus}>
          <span
            className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`}
          ></span>
          {isConnected ? t('connected') : t('disconnected')}
        </div>
      </div>

      <div className={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>{t('noChatMessages')}</div>
        ) : (
          messages.map((msg: ChatMessage, index: number) => (
            <div
              key={index}
              className={`${styles.message} ${msg.userId === userId ? styles.ownMessage : ''}`}
            >
              <div className={styles.messageHeader}>
                <span className={styles.username}>{msg.username}</span>
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

      <form onSubmit={handleSubmit} className={styles.inputContainer}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={isConnected ? t('writeMessage') : t('connecting')}
          disabled={!isConnected}
          className={styles.messageInput}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!isConnected || !inputMessage.trim()}
          className={styles.sendButton}
        >
          {t('send')}
        </button>
      </form>
    </div>
  );
};

export default Chat;
