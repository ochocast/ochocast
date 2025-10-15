import { Controller, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChatService } from './core/chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@ApiTags('Chat')
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
