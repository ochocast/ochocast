import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollsContainer.module.css';
import PollCreator from './PollCreator';
import PollVoting from './PollVoting';
import PollResults from './PollResults';
import PollAdmin from './PollAdmin';
import { getPollsByTrack } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { Poll } from './types';

interface PollsContainerProps {
  trackId: string;
  userId: string;
  isSpeaker: boolean;
  hideExtraPolls?: boolean;
  showOnlyExtraPolls?: boolean;
  showOnlyClosedPolls?: boolean;
}

// Helper to get/set voted polls from localStorage
const getVotedPollsFromStorage = (userId: string): Set<string> => {
  try {
    const stored = localStorage.getItem(`votedPolls_${userId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveVotedPollsToStorage = (userId: string, pollIds: Set<string>) => {
  try {
    localStorage.setItem(
      `votedPolls_${userId}`,
      JSON.stringify(Array.from(pollIds)),
    );
  } catch (err) {
    console.error('Failed to save voted polls to localStorage:', err);
  }
};

const PollsContainer: React.FC<PollsContainerProps> = ({
  trackId,
  userId,
  isSpeaker,
  hideExtraPolls = false,
  showOnlyExtraPolls = false,
  showOnlyClosedPolls = false,
}) => {
  const { socket } = useSocket({ trackId, username: '' });
  const { t } = useTranslation();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [userVotedPolls, setUserVotedPolls] = useState<Set<string>>(() =>
    getVotedPollsFromStorage(userId),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Load initial polls
  const loadPolls = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await getPollsByTrack(trackId);
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

    const handlePollCreated = (poll: Poll) => {
      // Reload all polls to ensure consistency
      loadPolls();
    };

    const handlePollAnswered = (poll: Poll) => {
      // Reload all polls to get updated vote counts
      loadPolls();
    };

    const handlePollClosed = ({ pollId }: { pollId: string }) => {
      // Reload all polls to reflect closed status
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
      saveVotedPollsToStorage(userId, updated);
      return updated;
    });
  };

  const handlePollClosed = (pollId: string) => {
    // Poll is automatically marked as closed via websocket
    void pollId; // unused param
  };

  // Separate polls by status
  const activePolis = polls.filter((p) => p.status === 'active');
  const closedPollsUnfiltered = polls.filter((p) => p.status !== 'active');

  // Get first poll/creator and rest for layout
  // Sort by creation date descending (newest first)
  const sortedActivePolis = [...activePolis].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // newest first
  });

  // Sort closed polls by creation date descending (newest first)
  const closedPolls = [...closedPollsUnfiltered].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // newest first
  });

  return (
    <div className={styles.container}>
      {isLoading ? (
        <div className={styles.loading}>{t('polls.loadingPolls')}</div>
      ) : (
        <>
          {/* Show only first poll/creator (for side-by-side layout) */}
          {hideExtraPolls && (
            <>
              {isSpeaker && (
                <PollCreator trackId={trackId} onPollCreated={loadPolls} />
              )}
            </>
          )}

          {/* Show only extra polls (for grid layout below) */}
          {showOnlyExtraPolls && (
            <>
              {!isSpeaker && sortedActivePolis.length > 0 && (
                <>
                  {sortedActivePolis.map((poll) =>
                    userVotedPolls.has(poll.id) ? (
                      <PollResults key={poll.id} poll={poll} />
                    ) : (
                      <PollVoting
                        key={poll.id}
                        poll={poll}
                        trackId={trackId}
                        userId={userId}
                        onVoted={handleUserVoted}
                      />
                    ),
                  )}
                </>
              )}

              {isSpeaker && sortedActivePolis.length > 0 && (
                <>
                  {sortedActivePolis.map((poll) => (
                    <PollAdmin
                      key={poll.id}
                      polls={[poll]}
                      trackId={trackId}
                      onPollClosed={handlePollClosed}
                      hideTitle={true}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* Show only closed polls (for separate grid) */}
          {showOnlyClosedPolls && (
            <>
              {closedPolls.length > 0 && (
                <>
                  {closedPolls.map((poll) => (
                    <PollResults key={poll.id} poll={poll} />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PollsContainer;
