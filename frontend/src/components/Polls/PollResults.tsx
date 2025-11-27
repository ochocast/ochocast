import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollResults.module.css';
import { Poll } from './types';

interface PollResultsProps {
  poll: Poll;
}

const PollResults: React.FC<PollResultsProps> = ({ poll }) => {
  const { t } = useTranslation();
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Calculate time remaining for active polls
  useEffect(() => {
    if (poll.status !== 'active') {
      setTimeRemaining(0);
      return;
    }

    // Use expiresAt if available (from server), otherwise fallback to duration calculation
    const getEndTime = () => {
      if (poll.expiresAt) {
        try {
          return new Date(poll.expiresAt).getTime();
        } catch (e) {
          console.warn('Invalid expiresAt date:', poll.expiresAt, e);
          // Fallback if expiresAt parsing fails
          const startTime = new Date(poll.createdAt).getTime();
          return startTime + poll.duration * 1000;
        }
      }
      // Fallback for older polls without expiresAt
      const startTime = new Date(poll.createdAt).getTime();
      return startTime + poll.duration * 1000;
    };

    const endTime = getEndTime();

    const calculateRemaining = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      return remaining;
    };

    // Set initial value immediately
    const initialRemaining = calculateRemaining();
    setTimeRemaining(initialRemaining);

    if (initialRemaining === 0) {
      return; // Don't start interval if already expired
    }

    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeRemaining(remaining);

      // Stop the timer when it reaches 0
      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [poll.createdAt, poll.duration, poll.status, poll.expiresAt]);

  const getPercentage = (index: number): number => {
    if (poll.totalVotes === 0) return 0;
    return ((poll.voteCount[index] || 0) / poll.totalVotes) * 100;
  };

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 title={poll.question}>{poll.question}</h3>
        <div className={styles.statusContainer}>
          <div className={`${styles.status} ${styles[poll.status]}`}>
            {poll.status === 'active' ? t('polls.active') : t('polls.closed')}
          </div>
          {poll.status === 'active' && (
            <div className={styles.timer}>
              {timeDisplay} {t('polls.secondsRemaining')}
            </div>
          )}
        </div>
      </div>

      <div className={styles.results}>
        {poll.responses.map((response: string, index: number) => {
          const count = poll.voteCount[index] || 0;
          const percentage = getPercentage(index);

          return (
            <div key={index} className={styles.resultRow}>
              <div className={styles.labelAndCount}>
                <span className={styles.label} title={response}>
                  {response}
                </span>
                <span className={styles.count}>{count}</span>
              </div>
              <div className={styles.barContainer}>
                <div
                  className={styles.bar}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className={styles.percentage}>
                {Math.round(percentage)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.totalVotes}>
          {t('polls.total')}: {poll.totalVotes}{' '}
          {poll.totalVotes > 1
            ? t('polls.participantCountPlural')
            : t('polls.participantCount')}
        </div>
      </div>
    </div>
  );
};

export default PollResults;
