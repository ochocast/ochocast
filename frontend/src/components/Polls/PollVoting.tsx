import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollVoting.module.css';
import { votePoll } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { Poll } from './types';

interface VoteData {
  responseIndex: number;
  sessionId?: string;
  userId?: string;
}

interface PollVotingProps {
  poll: Poll;
  trackId: string;
  userId: string;
  onVoted?: (pollId: string) => void;
  isPublic?: boolean;
  votePollFunction?: (
    pollId: string,
    voteData: VoteData,
  ) => Promise<{ ok: boolean; data?: Poll }>;
}

const PollVoting: React.FC<PollVotingProps> = ({
  poll,
  trackId,
  userId,
  onVoted,
  isPublic = false,
  votePollFunction,
}) => {
  const { socket } = useSocket({ trackId, username: '' });
  const { t } = useTranslation();
  const [selectedResponse, setSelectedResponse] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(poll.duration);
  const [error, setError] = useState<string | null>(null);

  // Calculate time remaining
  useEffect(() => {
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

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeRemaining(remaining);

      // Stop the timer when it reaches 0
      if (remaining === 0) {
        return false; // Signal to stop the interval
      }
      return true; // Continue the interval
    };

    // Set initial value immediately
    const shouldContinue = updateTimer();

    if (!shouldContinue) {
      return; // Don't start interval if already expired
    }

    const timer = setInterval(() => {
      const shouldContinue = updateTimer();
      if (!shouldContinue) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [poll]);

  const handleVote = async () => {
    if (selectedResponse === null) {
      setError(t('polls.selectResponse'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Prepare vote data
      // For public users: send sessionId
      // For authenticated users: send userId explicitly (route is @Public so JWT won't be checked)
      const voteData = isPublic
        ? {
            responseIndex: selectedResponse,
            sessionId: userId,
          }
        : {
            responseIndex: selectedResponse,
            userId: userId,
          };

      // Use provided vote function or default
      const voteFunction = votePollFunction || votePoll;
      const response = await voteFunction(poll.id, voteData);

      if (response.ok) {
        // Emit vote via websocket
        if (socket) {
          socket.emit('pollAnswered', {
            trackId,
            poll: response.data,
          });
        }

        onVoted?.(poll.id);
      } else {
        // Check if error is due to expiration
        const errorMessage = response.data?.message || '';
        if (errorMessage.includes('expired')) {
          setError(t('polls.pollExpired'));
        } else {
          setError(t('polls.votingError'));
        }
      }
    } catch (err: unknown) {
      // Check if error is due to expiration
      const error = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      const errorMessage =
        error?.response?.data?.message || error?.message || '';
      if (errorMessage.includes('expired')) {
        setError(t('polls.pollExpired'));
      } else {
        setError(t('polls.votingError'));
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 title={poll.question}>{poll.question}</h3>
        <div className={styles.timer}>
          {timeDisplay} {t('polls.secondsRemaining')}
        </div>
      </div>

      <div className={styles.responses}>
        {poll.responses.map((response: string, index: number) => (
          <label key={index} className={styles.responseOption}>
            <input
              type="radio"
              name={`poll-${poll.id}`}
              value={index}
              checked={selectedResponse === index}
              onChange={() => setSelectedResponse(index)}
              disabled={isLoading || poll.status !== 'active'}
            />
            <span className={styles.responseLabel} title={response}>
              {response}
            </span>
          </label>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.info}>
          {poll.totalVotes}{' '}
          {poll.totalVotes > 1
            ? t('polls.participantCountPlural')
            : t('polls.participantCount')}
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button
          onClick={handleVote}
          className={styles.submitBtn}
          disabled={
            isLoading ||
            poll.status !== 'active' ||
            selectedResponse === null ||
            timeRemaining === 0
          }
        >
          {isLoading
            ? t('polls.sending')
            : timeRemaining === 0
              ? t('polls.expired')
              : t('polls.sendVote')}
        </button>
      </div>
    </div>
  );
};

export default PollVoting;
