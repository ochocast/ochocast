import {
  Controller,
  Get,
  Param,
  Delete,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { ChatService } from './core/chat.service';
import { ChatStatisticsService } from './core/chat-statistics.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import {
  EventChatStatisticsDto,
  TrackChatStatisticsDto,
} from './dto/chat-statistics.dto';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatStatisticsService: ChatStatisticsService,
  ) {}

  // Statistics endpoints - must come BEFORE parameterized routes
  @Public()
  @Get('events/:eventId/statistics')
  @ApiOperation({ summary: 'Get chat statistics for an event' })
  @ApiQuery({
    name: 'subscriberCount',
    required: false,
    description: 'Number of subscribers to calculate engagement rate',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns chat statistics for the event',
    type: EventChatStatisticsDto,
  })
  async getEventChatStatistics(
    @Param('eventId') eventId: string,
    @Query('subscriberCount') subscriberCount?: string,
  ): Promise<EventChatStatisticsDto> {
    const count = subscriberCount ? parseInt(subscriberCount, 10) : 0;
    return await this.chatStatisticsService.getEventChatStatistics(
      eventId,
      count,
    );
  }

  @Public()
  @Get('tracks/:trackId/statistics')
  @ApiOperation({ summary: 'Get chat statistics for a track' })
  @ApiResponse({
    status: 200,
    description: 'Returns chat statistics for the track',
    type: TrackChatStatisticsDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Track not found',
  })
  async getTrackChatStatistics(
    @Param('trackId') trackId: string,
  ): Promise<TrackChatStatisticsDto> {
    const stats =
      await this.chatStatisticsService.getTrackChatStatistics(trackId);
    if (!stats) {
      throw new NotFoundException('Track not found');
    }
    return stats;
  }

  // Message endpoints
  @Get('tracks/:trackId/messages')
  @ApiOperation({ summary: 'Get messages for a track' })
  @ApiResponse({
    status: 200,
    description: 'Returns all messages for the specified track',
    type: [ChatMessageDto],
  })
  async getTrackMessages(
    @Param('trackId') trackId: string,
  ): Promise<ChatMessageDto[]> {
    return await this.chatService.getTrackMessages(trackId);
  }

  @Delete('tracks/:trackId/messages')
  @ApiOperation({ summary: 'Clear all messages for a track' })
  @ApiResponse({
    status: 200,
    description: 'All messages for the track have been cleared',
  })
  async clearTrackMessages(@Param('trackId') trackId: string): Promise<void> {
    return await this.chatService.clearTrackMessages(trackId);
  }

  @Delete('messages/:messageId')
  @ApiOperation({ summary: 'Delete a specific message' })
  @ApiResponse({
    status: 200,
    description: 'Message has been deleted',
  })
  async deleteMessage(@Param('messageId') messageId: string): Promise<void> {
    return await this.chatService.deleteMessage(messageId);
  }
}
