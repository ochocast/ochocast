import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ChatMessageDto } from '../../dto/chat-message.dto';

@Injectable()
export class ChatMessageRepository {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessageRepository: Repository<ChatMessageEntity>,
  ) {}

  async saveMessage(messageDto: ChatMessageDto): Promise<ChatMessageEntity> {
    const messageEntity = this.chatMessageRepository.create({
      message: messageDto.message,
      userId: messageDto.userId,
      username: messageDto.username,
      trackId: messageDto.trackId,
      timestamp: messageDto.timestamp || new Date(),
    });

    return await this.chatMessageRepository.save(messageEntity);
  }

  async getMessagesByTrackId(trackId: string): Promise<ChatMessageEntity[]> {
    return await this.chatMessageRepository.find({
      where: { trackId },
      order: { timestamp: 'ASC' },
      take: 100, // Limite à 100 messages récents
    });
  }

  async deleteMessagesByTrackId(trackId: string): Promise<void> {
    await this.chatMessageRepository.delete({ trackId });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.chatMessageRepository.delete({ id: messageId });
  }
}
