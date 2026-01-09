import React, { useState, useEffect } from 'react';
import styles from './ChatStatistics.module.css';
import { getEventChatStatistics } from '../../../../utils/api';
import { useTranslation } from 'react-i18next';
import {
  MessageIcon,
  UsersIcon,
  HeartIcon,
  ClockIcon,
  MicrophoneIcon,
  TrophyIcon,
} from './StatIcons';

// Type definitions for chat statistics
interface EmojiCount {
  emoji: string;
  count: number;
}

interface TopContributor {
  userId: string;
  username: string;
  messageCount: number;
}

interface HourlyMessageCount {
  hour: number;
  count: number;
}

interface TrackChatStatistics {
  trackId: string;
  trackName: string;
  messageCount: number;
  participantCount: number;
  reactionCount: number;
  topContributors: TopContributor[];
}

interface EventChatStatistics {
  totalMessages: number;
  uniqueParticipants: number;
  totalReactions: number;
  topEmojis: EmojiCount[];
  engagementRate: number;
  trackStatistics: TrackChatStatistics[];
  messagesPerHour: HourlyMessageCount[];
  peakActivityHour: number;
}

interface ChatStatisticsProps {
  eventId?: string;
  subscriberCount?: number;
}

const ChatStatistics: React.FC<ChatStatisticsProps> = ({
  eventId,
  subscriberCount = 0,
}) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<EventChatStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await getEventChatStatistics(eventId, subscriberCount);
        if (response.ok) {
          setStats(response.data as EventChatStatistics);
        } else {
          setError('Failed to fetch chat statistics');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    if (eventId) {
      fetchStats();
    }
  }, [eventId, subscriberCount]);

  if (isLoading) {
    return <div className={styles.loading}>{t('loading')}...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!stats) {
    return null;
  }

  const formatHour = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {String(t('chatStatistics.title')) || 'Chat Statistics'}
        </h3>
      </div>

      {/* Global Stats Cards */}
      <div className={styles.globalStats}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>
            <MessageIcon size={24} color="var(--theme-color-500)" />
          </span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.totalMessages}</span>
            <span className={styles.statLabel}>
              {String(t('chatStatistics.totalMessages')) || 'Total Messages'}
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statIcon}>
            <UsersIcon size={24} color="var(--theme-color-500)" />
          </span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.uniqueParticipants}</span>
            <span className={styles.statLabel}>
              {String(t('chatStatistics.uniqueParticipants')) ||
                'Unique Participants'}
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statIcon}>
            <HeartIcon size={24} color="var(--theme-color-500)" />
          </span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.totalReactions}</span>
            <span className={styles.statLabel}>
              {String(t('chatStatistics.totalReactions')) || 'Total Reactions'}
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statIcon}>
            <ClockIcon size={24} color="var(--theme-color-500)" />
          </span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>
              {formatHour(stats.peakActivityHour)}
            </span>
            <span className={styles.statLabel}>
              {String(t('chatStatistics.peakActivityHour')) ||
                'Peak Activity Hour'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Emojis */}
      {stats.topEmojis && stats.topEmojis.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {String(t('chatStatistics.topEmojis')) || 'Top Emojis'}
          </h4>
          <div className={styles.emojiList}>
            {stats.topEmojis.map((emoji: EmojiCount, index: number) => (
              <div key={index} className={styles.emojiItem}>
                <span className={styles.emoji}>{emoji.emoji}</span>
                <span className={styles.emojiCount}>{emoji.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Distribution */}
      {stats.messagesPerHour &&
        stats.messagesPerHour.some((h: HourlyMessageCount) => h.count > 0) && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              {String(t('chatStatistics.messagesPerHour')) ||
                'Messages Per Hour'}
            </h4>
            <div className={styles.hourlyChart}>
              {stats.messagesPerHour.map((hourData: HourlyMessageCount) => {
                const maxCount = Math.max(
                  ...stats.messagesPerHour.map(
                    (h: HourlyMessageCount) => h.count,
                  ),
                  1,
                );
                const height = (hourData.count / maxCount) * 100;
                return (
                  <div key={hourData.hour} className={styles.hourlyBar}>
                    <div
                      className={styles.bar}
                      style={{ height: `${height}%` }}
                      title={`${formatHour(hourData.hour)}: ${hourData.count} messages`}
                    />
                    {hourData.hour % 4 === 0 && (
                      <span className={styles.hourLabel}>{hourData.hour}h</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {stats.trackStatistics && stats.trackStatistics.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {String(t('chatStatistics.trackStats')) || 'Statistics by Track'}
          </h4>

          <div className={styles.trackCards}>
            {stats.trackStatistics.map((track: TrackChatStatistics) => (
              <div key={track.trackId} className={styles.trackCard}>
                <h5 className={styles.trackName}>
                  <MicrophoneIcon size={16} className={styles.trackIcon} />
                  {track.trackName}
                </h5>
                <div className={styles.trackStats}>
                  <div className={styles.trackStat}>
                    <span className={styles.trackStatValue}>
                      {track.messageCount}
                    </span>
                    <span className={styles.trackStatLabel}>
                      {String(t('messages')) || 'Messages'}
                    </span>
                  </div>
                  <div className={styles.trackStat}>
                    <span className={styles.trackStatValue}>
                      {track.participantCount}
                    </span>
                    <span className={styles.trackStatLabel}>
                      {String(t('chatStatistics.participants')) ||
                        'Participants'}
                    </span>
                  </div>
                  <div className={styles.trackStat}>
                    <span className={styles.trackStatValue}>
                      {track.reactionCount}
                    </span>
                    <span className={styles.trackStatLabel}>
                      {String(t('chatStatistics.reactions')) || 'Reactions'}
                    </span>
                  </div>
                </div>
                {track.topContributors && track.topContributors.length > 0 && (
                  <div className={styles.topContributors}>
                    <span className={styles.contributorsLabel}>
                      <TrophyIcon
                        size={14}
                        style={{ marginRight: 4, verticalAlign: 'text-bottom' }}
                      />
                      {String(t('chatStatistics.topContributors')) ||
                        'Top Contributors'}
                      :
                    </span>
                    {track.topContributors.map(
                      (contributor: TopContributor, idx: number) => (
                        <span key={idx} className={styles.contributor}>
                          {idx + 1}. {contributor.username} (
                          {contributor.messageCount})
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatStatistics;
