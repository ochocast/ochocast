import { Injectable } from '@nestjs/common';
import { ChatMessageRepository } from '../infra/gateways/chat-message.repository';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { ChatMessageEntity } from '../infra/gateways/entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  async saveMessage(messageDto: ChatMessageDto): Promise<ChatMessageEntity> {
    return await this.chatMessageRepository.saveMessage(messageDto);
  }

  async getTrackMessages(trackId: string): Promise<ChatMessageDto[]> {
    const messages =
      await this.chatMessageRepository.getMessagesByTrackId(trackId);

    return messages.map((message) => ({
      trackId: message.trackId,
      userId: message.userId,
      username: message.username,
      message: message.message,
      timestamp: message.timestamp,
    }));
  }

  async clearTrackMessages(trackId: string): Promise<void> {
    await this.chatMessageRepository.deleteMessagesByTrackId(trackId);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.chatMessageRepository.deleteMessage(messageId);
  }
}
