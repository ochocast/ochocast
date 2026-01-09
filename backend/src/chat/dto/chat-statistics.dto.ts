import { ApiProperty } from '@nestjs/swagger';

export class EmojiCountDto {
  @ApiProperty({ description: 'Emoji character' })
  emoji: string;

  @ApiProperty({ description: 'Number of times this emoji was used' })
  count: number;
}

export class TopContributorDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Number of messages sent' })
  messageCount: number;
}

export class HourlyMessageCountDto {
  @ApiProperty({ description: 'Hour of the day (0-23)' })
  hour: number;

  @ApiProperty({ description: 'Number of messages in this hour' })
  count: number;
}

export class TrackChatStatisticsDto {
  @ApiProperty({ description: 'Track ID' })
  trackId: string;

  @ApiProperty({ description: 'Track name' })
  trackName: string;

  @ApiProperty({ description: 'Total messages in this track' })
  messageCount: number;

  @ApiProperty({ description: 'Unique participants in this track' })
  participantCount: number;

  @ApiProperty({ description: 'Total reactions in this track' })
  reactionCount: number;

  @ApiProperty({
    description: 'Top contributors for this track',
    type: [TopContributorDto],
  })
  topContributors: TopContributorDto[];
}

export class EventChatStatisticsDto {
  @ApiProperty({ description: 'Total messages across all tracks' })
  totalMessages: number;

  @ApiProperty({ description: 'Unique participants across all tracks' })
  uniqueParticipants: number;

  @ApiProperty({ description: 'Total reactions across all tracks' })
  totalReactions: number;

  @ApiProperty({ description: 'Top emojis used', type: [EmojiCountDto] })
  topEmojis: EmojiCountDto[];

  @ApiProperty({
    description: 'Engagement rate (participants / subscribers)',
    example: 0.75,
  })
  engagementRate: number;

  @ApiProperty({
    description: 'Statistics per track',
    type: [TrackChatStatisticsDto],
  })
  trackStatistics: TrackChatStatisticsDto[];

  @ApiProperty({
    description: 'Message count per hour',
    type: [HourlyMessageCountDto],
  })
  messagesPerHour: HourlyMessageCountDto[];

  @ApiProperty({ description: 'Peak activity hour (0-23)', example: 14 })
  peakActivityHour: number;
}
