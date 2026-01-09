import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatMessageEntity } from '../infra/gateways/entities/chat-message.entity';
import { MessageReactionEntity } from '../infra/gateways/entities/message-reaction.entity';
import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
import {
  EventChatStatisticsDto,
  TrackChatStatisticsDto,
  EmojiCountDto,
  TopContributorDto,
  HourlyMessageCountDto,
} from '../dto/chat-statistics.dto';

@Injectable()
export class ChatStatisticsService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessageRepository: Repository<ChatMessageEntity>,
    @InjectRepository(MessageReactionEntity)
    private readonly reactionRepository: Repository<MessageReactionEntity>,
    @InjectRepository(TrackEntity)
    private readonly trackRepository: Repository<TrackEntity>,
  ) {}

  async getEventChatStatistics(
    eventId: string,
    subscriberCount: number = 0,
  ): Promise<EventChatStatisticsDto> {
    // Get all tracks for this event
    const tracks = await this.trackRepository.find({
      where: { eventId },
    });

    const trackIds = tracks.map((t) => t.id);

    if (trackIds.length === 0) {
      return this.getEmptyStatistics();
    }

    // Get all messages for these tracks
    const messages = await this.chatMessageRepository.find({
      where: { trackId: In(trackIds) },
    });

    const messageIds = messages.map((m) => m.id);

    // Get all reactions
    const reactions =
      messageIds.length > 0
        ? await this.reactionRepository.find({
            where: { messageId: In(messageIds) },
          })
        : [];

    // Calculate global statistics
    const totalMessages = messages.length;
    const uniqueParticipants = new Set(messages.map((m) => m.userId)).size;
    const totalReactions = reactions.length;

    // Top emojis
    const topEmojis = this.calculateTopEmojis(reactions);

    // Engagement rate
    const engagementRate =
      subscriberCount > 0 ? uniqueParticipants / subscriberCount : 0;

    // Temporal statistics
    const messagesPerHour = this.calculateMessagesPerHour(messages);
    const peakActivityHour = this.findPeakActivityHour(messagesPerHour);

    // Per-track statistics
    const trackStatistics = await Promise.all(
      tracks.map((track) =>
        this.calculateTrackStatistics(track, messages, reactions),
      ),
    );

    return {
      totalMessages,
      uniqueParticipants,
      totalReactions,
      topEmojis,
      engagementRate,
      trackStatistics,
      messagesPerHour,
      peakActivityHour,
    };
  }

  async getTrackChatStatistics(
    trackId: string,
  ): Promise<TrackChatStatisticsDto | null> {
    const track = await this.trackRepository.findOne({
      where: { id: trackId },
    });

    if (!track) {
      return null;
    }

    const messages = await this.chatMessageRepository.find({
      where: { trackId },
    });

    const messageIds = messages.map((m) => m.id);
    const reactions =
      messageIds.length > 0
        ? await this.reactionRepository.find({
            where: { messageId: In(messageIds) },
          })
        : [];

    return this.calculateTrackStatistics(track, messages, reactions);
  }

  private calculateTrackStatistics(
    track: TrackEntity,
    allMessages: ChatMessageEntity[],
    allReactions: MessageReactionEntity[],
  ): TrackChatStatisticsDto {
    const trackMessages = allMessages.filter((m) => m.trackId === track.id);
    const trackMessageIds = new Set(trackMessages.map((m) => m.id));
    const trackReactions = allReactions.filter((r) =>
      trackMessageIds.has(r.messageId),
    );

    const messageCount = trackMessages.length;
    const participantCount = new Set(trackMessages.map((m) => m.userId)).size;
    const reactionCount = trackReactions.length;
    const topContributors = this.calculateTopContributors(trackMessages);

    return {
      trackId: track.id,
      trackName: track.name,
      messageCount,
      participantCount,
      reactionCount,
      topContributors,
    };
  }

  private calculateTopEmojis(
    reactions: MessageReactionEntity[],
    limit: number = 5,
  ): EmojiCountDto[] {
    const emojiCounts = new Map<string, number>();

    for (const reaction of reactions) {
      const count = emojiCounts.get(reaction.emoji) || 0;
      emojiCounts.set(reaction.emoji, count + 1);
    }

    return Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private calculateTopContributors(
    messages: ChatMessageEntity[],
    limit: number = 3,
  ): TopContributorDto[] {
    const contributorCounts = new Map<
      string,
      { username: string; count: number }
    >();

    for (const message of messages) {
      const existing = contributorCounts.get(message.userId) || {
        username: message.username,
        count: 0,
      };
      existing.count += 1;
      contributorCounts.set(message.userId, existing);
    }

    return Array.from(contributorCounts.entries())
      .map(([userId, data]) => ({
        userId,
        username: data.username,
        messageCount: data.count,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit);
  }

  private calculateMessagesPerHour(
    messages: ChatMessageEntity[],
  ): HourlyMessageCountDto[] {
    const hourCounts = new Map<number, number>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourCounts.set(i, 0);
    }

    for (const message of messages) {
      const hour = new Date(message.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    return Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);
  }

  private findPeakActivityHour(
    messagesPerHour: HourlyMessageCountDto[],
  ): number {
    if (messagesPerHour.length === 0) {
      return 0;
    }

    const peak = messagesPerHour.reduce((max, current) =>
      current.count > max.count ? current : max,
    );

    return peak.hour;
  }

  private getEmptyStatistics(): EventChatStatisticsDto {
    return {
      totalMessages: 0,
      uniqueParticipants: 0,
      totalReactions: 0,
      topEmojis: [],
      engagementRate: 0,
      trackStatistics: [],
      messagesPerHour: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: 0,
      })),
      peakActivityHour: 0,
    };
  }
}
