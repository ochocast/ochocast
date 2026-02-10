import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollsContainer.module.css';
import PollVoting from './PollVoting';
import PollResults from './PollResults';
import { getPollsByTrackPublic, votePollPublic } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { Poll } from './types';

interface PublicPollsViewerProps {
  trackId: string;
}

// Generate or retrieve a unique session ID for anonymous voting
const getOrCreateSessionId = (): string => {
  let sessionId = localStorage.getItem('publicSessionId');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('publicSessionId', sessionId);
  }
  return sessionId;
};

// Helper to get/set voted polls from localStorage
const getVotedPollsFromStorage = (sessionId: string): Set<string> => {
  try {
    const stored = localStorage.getItem(`votedPolls_${sessionId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveVotedPollsToStorage = (sessionId: string, pollIds: Set<string>) => {
  try {
    localStorage.setItem(
      `votedPolls_${sessionId}`,
      JSON.stringify(Array.from(pollIds)),
    );
  } catch (err) {
    console.error('Failed to save voted polls to localStorage:', err);
  }
};

const PublicPollsViewer: React.FC<PublicPollsViewerProps> = ({ trackId }) => {
  const { socket } = useSocket({ trackId, username: 'guest' });
  const { t } = useTranslation();
  const [polls, setPolls] = useState<Poll[]>([]);
  const sessionId = getOrCreateSessionId();
  const [userVotedPolls, setUserVotedPolls] = useState<Set<string>>(() =>
    getVotedPollsFromStorage(sessionId),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Load initial polls
  const loadPolls = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await getPollsByTrackPublic(trackId);
      if (response.ok && Array.isArray(response.data)) {
        setPolls(response.data);
      }
    } catch (err) {
      console.error('Error loading polls:', err);
    } finally {
      setIsLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  // Listen to websocket events
  useEffect(() => {
    if (!socket) return;

    const handlePollCreated = () => {
      loadPolls();
    };

    const handlePollAnswered = () => {
      loadPolls();
    };

    const handlePollClosed = () => {
      loadPolls();
    };

    socket.on('pollCreated', handlePollCreated);
    socket.on('pollAnswered', handlePollAnswered);
    socket.on('pollClosed', handlePollClosed);

    return () => {
      socket.off('pollCreated', handlePollCreated);
      socket.off('pollAnswered', handlePollAnswered);
      socket.off('pollClosed', handlePollClosed);
    };
  }, [socket, loadPolls]);

  const handleUserVoted = (pollId: string) => {
    setUserVotedPolls((prev) => {
      const updated = new Set(Array.from(prev).concat(pollId));
      saveVotedPollsToStorage(sessionId, updated);
      return updated;
    });
  };

  // Separate polls by status
  const activePolis = polls.filter((p) => p.status === 'active');
  const closedPollsUnfiltered = polls.filter((p) => p.status !== 'active');

  const sortedActivePolis = [...activePolis].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // newest first
  });

  const closedPolls = [...closedPollsUnfiltered].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // newest first
  });

  const firstPoll = sortedActivePolis[0];
  const restPolls = sortedActivePolis.slice(1);

  return (
    <div className={styles.container}>
      {isLoading ? (
        <div className={styles.loading}>{t('publicTrack.loadingPolls')}</div>
      ) : polls.length === 0 ? (
        <div className={styles.empty}>{t('publicTrack.noPollsAvailable')}</div>
      ) : (
        <>
          {/* First active poll - main display */}
          {firstPoll && (
            <div className={styles.mainPoll}>
              <div className={styles.pollCard}>
                {firstPoll.status === 'active' &&
                !userVotedPolls.has(firstPoll.id) ? (
                  <PollVoting
                    poll={firstPoll}
                    trackId={trackId}
                    userId={sessionId}
                    onVoted={handleUserVoted}
                    isPublic
                    votePollFunction={votePollPublic}
                  />
                ) : (
                  <PollResults poll={firstPoll} />
                )}
              </div>
            </div>
          )}

          {/* Extra polls - grid display */}
          {restPolls.length > 0 && (
            <div className={styles.extraPolls}>
              <h4>{t('publicTrack.otherPolls')}</h4>
              <div className={styles.pollsGrid}>
                {restPolls.map((poll) => (
                  <div key={poll.id} className={styles.pollCard}>
                    {poll.status === 'active' &&
                    !userVotedPolls.has(poll.id) ? (
                      <PollVoting
                        poll={poll}
                        trackId={trackId}
                        userId={sessionId}
                        onVoted={handleUserVoted}
                        isPublic
                        votePollFunction={votePollPublic}
                      />
                    ) : (
                      <PollResults poll={poll} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closed polls */}
          {closedPolls.length > 0 && (
            <div className={styles.closedPolls}>
              <h4>{t('publicTrack.closedPolls')}</h4>
              <div className={styles.pollsGrid}>
                {closedPolls.map((poll) => (
                  <div key={poll.id} className={styles.pollCard}>
                    <PollResults poll={poll} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PublicPollsViewer;
