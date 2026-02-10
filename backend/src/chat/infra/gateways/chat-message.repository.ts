import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { MessageReactionEntity } from './entities/message-reaction.entity';
import { ChatMessageDto } from '../../dto/chat-message.dto';

@Injectable()
export class ChatMessageRepository {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessageRepository: Repository<ChatMessageEntity>,
    @InjectRepository(MessageReactionEntity)
    private readonly reactionRepository: Repository<MessageReactionEntity>,
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

  async getMessageById(messageId: string): Promise<ChatMessageEntity | null> {
    return await this.chatMessageRepository.findOne({
      where: { id: messageId },
    });
  }

  async getMessagesByTrackId(trackId: string): Promise<ChatMessageEntity[]> {
    return await this.chatMessageRepository.find({
      where: { trackId },
      order: { timestamp: 'ASC' },
      take: 100, // Limite à 100 messages récents
    });
  }

  async updateMessage(
    messageId: string,
    newContent: string,
  ): Promise<ChatMessageEntity | null> {
    const message = await this.chatMessageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      return null;
    }

    message.message = newContent;
    message.editedAt = new Date();

    return await this.chatMessageRepository.save(message);
  }

  async deleteMessagesByTrackId(trackId: string): Promise<void> {
    await this.chatMessageRepository.delete({ trackId });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.chatMessageRepository.delete({ id: messageId });
  }

  // Reaction methods
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageReactionEntity> {
    // Check if reaction already exists
    const existing = await this.reactionRepository.findOne({
      where: { messageId, userId, emoji },
    });

    if (existing) {
      return existing;
    }

    const reaction = this.reactionRepository.create({
      messageId,
      userId,
      emoji,
    });

    return await this.reactionRepository.save(reaction);
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.reactionRepository.delete({ messageId, userId, emoji });
  }

  async getReactionsByMessageId(
    messageId: string,
  ): Promise<MessageReactionEntity[]> {
    return await this.reactionRepository.find({
      where: { messageId },
    });
  }

  async getReactionsByMessageIds(
    messageIds: string[],
  ): Promise<MessageReactionEntity[]> {
    if (messageIds.length === 0) {
      return [];
    }

    return await this.reactionRepository
      .createQueryBuilder('reaction')
      .where('reaction.messageId IN (:...messageIds)', { messageIds })
      .getMany();
  }
}
