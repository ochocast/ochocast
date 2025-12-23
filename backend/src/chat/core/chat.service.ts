import { Injectable } from '@nestjs/common';
import { ChatMessageRepository } from '../infra/gateways/chat-message.repository';
import { ChatMessageDto, ReactionDto } from '../dto/chat-message.dto';
import { ChatMessageEntity } from '../infra/gateways/entities/chat-message.entity';
import { MessageReactionEntity } from '../infra/gateways/entities/message-reaction.entity';

@Injectable()
export class ChatService {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  async saveMessage(messageDto: ChatMessageDto): Promise<ChatMessageEntity> {
    return await this.chatMessageRepository.saveMessage(messageDto);
  }

  async getMessageById(messageId: string): Promise<ChatMessageDto | null> {
    const message = await this.chatMessageRepository.getMessageById(messageId);
    if (!message) {
      return null;
    }

    const reactions =
      await this.chatMessageRepository.getReactionsByMessageId(messageId);

    return this.toDto(message, reactions);
  }

  async getTrackMessages(trackId: string): Promise<ChatMessageDto[]> {
    const messages =
      await this.chatMessageRepository.getMessagesByTrackId(trackId);

    // Get all reactions for these messages
    const messageIds = messages.map((m) => m.id);
    const allReactions =
      await this.chatMessageRepository.getReactionsByMessageIds(messageIds);

    // Group reactions by message
    const reactionsByMessage = new Map<string, MessageReactionEntity[]>();
    for (const reaction of allReactions) {
      const existing = reactionsByMessage.get(reaction.messageId) || [];
      existing.push(reaction);
      reactionsByMessage.set(reaction.messageId, existing);
    }

    return messages.map((message) => {
      const messageReactions = reactionsByMessage.get(message.id) || [];
      return this.toDto(message, messageReactions);
    });
  }

  async updateMessage(
    messageId: string,
    newContent: string,
  ): Promise<ChatMessageDto | null> {
    const updated = await this.chatMessageRepository.updateMessage(
      messageId,
      newContent,
    );

    if (!updated) {
      return null;
    }

    const reactions =
      await this.chatMessageRepository.getReactionsByMessageId(messageId);

    return this.toDto(updated, reactions);
  }

  async clearTrackMessages(trackId: string): Promise<void> {
    await this.chatMessageRepository.deleteMessagesByTrackId(trackId);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.chatMessageRepository.deleteMessage(messageId);
  }

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.chatMessageRepository.addReaction(messageId, userId, emoji);
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.chatMessageRepository.removeReaction(messageId, userId, emoji);
  }

  async getReactionsForMessage(messageId: string): Promise<ReactionDto[]> {
    const reactions =
      await this.chatMessageRepository.getReactionsByMessageId(messageId);
    return this.aggregateReactions(reactions);
  }

  private toDto(
    message: ChatMessageEntity,
    reactions: MessageReactionEntity[],
  ): ChatMessageDto {
    return {
      id: message.id,
      trackId: message.trackId,
      userId: message.userId,
      username: message.username,
      message: message.message,
      timestamp: message.timestamp,
      editedAt: message.editedAt,
      reactions: this.aggregateReactions(reactions),
    };
  }

  private aggregateReactions(
    reactions: MessageReactionEntity[],
  ): ReactionDto[] {
    const emojiMap = new Map<string, { count: number; userIds: string[] }>();

    for (const reaction of reactions) {
      const existing = emojiMap.get(reaction.emoji) || {
        count: 0,
        userIds: [],
      };
      existing.count += 1;
      existing.userIds.push(reaction.userId);
      emojiMap.set(reaction.emoji, existing);
    }

    return Array.from(emojiMap.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      userIds: data.userIds,
    }));
  }
}
