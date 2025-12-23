import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './core/chat.service';
import { ChatMessageRepository } from './infra/gateways/chat-message.repository';
import { ChatMessageEntity } from './infra/gateways/entities/chat-message.entity';
import { MessageReactionEntity } from './infra/gateways/entities/message-reaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessageEntity, MessageReactionEntity]),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, ChatMessageRepository],
  exports: [ChatGateway, ChatService],
})
export class ChatModule {}
