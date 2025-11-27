import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollAdmin.module.css';
import PollResults from './PollResults';
import { closePoll } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { Poll } from './types';

interface PollAdminProps {
  polls: Poll[];
  trackId: string;
  onPollClosed?: (pollId: string) => void;
  hideTitle?: boolean;
}

const PollAdmin: React.FC<PollAdminProps> = ({
  polls,
  trackId,
  onPollClosed,
  hideTitle = false,
}) => {
  const { socket } = useSocket({ trackId, username: '' });
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const handleClosePoll = async (pollId: string) => {
    try {
      setIsLoading({ ...isLoading, [pollId]: true });

      const response = await closePoll(pollId);

      if (response.ok) {
        // Emit poll closed via websocket
        if (socket) {
          socket.emit('pollClosed', {
            trackId,
            pollId,
          });
        }

        onPollClosed?.(pollId);
      }
    } catch (err) {
      console.error('Error closing poll:', err);
    } finally {
      setIsLoading({ ...isLoading, [pollId]: false });
    }
  };

  if (polls.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.empty}>{t('polls.noPollsForNow')}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {!hideTitle && <h3>{t('polls.speakerView')}</h3>}
      <div className={styles.pollsList}>
        {polls.map((poll) => (
          <div key={poll.id} className={styles.pollCard}>
            <PollResults poll={poll} />
            {poll.status === 'active' && (
              <button
                onClick={() => handleClosePoll(poll.id)}
                className={styles.closeBtn}
                disabled={isLoading[poll.id]}
              >
                {isLoading[poll.id]
                  ? t('polls.closingPoll')
                  : t('polls.closePoll')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PollAdmin;
