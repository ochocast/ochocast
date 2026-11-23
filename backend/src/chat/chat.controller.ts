import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
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
import { ChatAccess } from './core/chat-access';
import { CurrentUserEmail } from '../common/decorators/current-user-email.decorator';
import { IUserGateway } from '../users/domain/gateways/users.gateway';
import { ITrackGateway } from '../tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from '../events/domain/gateways/events.gateway';
import { UserObject } from '../users/domain/user';
import {
  EventChatStatisticsDto,
  TrackChatStatisticsDto,
} from './dto/chat-statistics.dto';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  private readonly access: ChatAccess;

  constructor(
    private readonly chatService: ChatService,
    private readonly chatStatisticsService: ChatStatisticsService,
    @Inject('UserGateway') private readonly userGateway: IUserGateway,
    @Inject('TrackGateway') trackGateway: ITrackGateway,
    @Inject('EventGateway') eventGateway: IEventGateway,
  ) {
    this.access = new ChatAccess(trackGateway, eventGateway);
  }

  private async user(email?: string): Promise<UserObject | null> {
    return email ? await this.userGateway.getUserByEmail(email) : null;
  }

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
    @CurrentUserEmail() email?: string,
  ): Promise<ChatMessageDto[]> {
    // Same visibility as the live chat: unpublished events only for their creator and speakers.
    if (!(await this.access.canRead(trackId, await this.user(email))))
      throw new NotFoundException('Track not found');
    return await this.chatService.getTrackMessages(trackId);
  }

  @Delete('tracks/:trackId/messages')
  @ApiOperation({ summary: 'Clear all messages for a track' })
  @ApiResponse({
    status: 200,
    description: 'All messages for the track have been cleared',
  })
  async clearTrackMessages(
    @Param('trackId') trackId: string,
    @CurrentUserEmail() email?: string,
  ): Promise<void> {
    // Clearing a chat moderates it: the track's speakers and the event's creator only.
    if (!(await this.access.canModerate(trackId, await this.user(email))))
      throw new ForbiddenException('Only speakers can clear this chat');
    return await this.chatService.clearTrackMessages(trackId);
  }

  @Delete('messages/:messageId')
  @ApiOperation({ summary: 'Delete a specific message' })
  @ApiResponse({
    status: 200,
    description: 'Message has been deleted',
  })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUserEmail() email?: string,
  ): Promise<void> {
    // The author, or a speaker of the message's track (same rule as the live chat).
    const user = await this.user(email);
    const message = await this.chatService.getMessageById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    if (
      !user ||
      (message.userId !== user.id &&
        !(await this.access.canModerate(message.trackId, user)))
    )
      throw new ForbiddenException('Not authorized to delete this message');
    return await this.chatService.deleteMessage(messageId);
  }
}
