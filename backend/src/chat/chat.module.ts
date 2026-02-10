import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './core/chat.service';
import { ChatStatisticsService } from './core/chat-statistics.service';
import { ChatMessageRepository } from './infra/gateways/chat-message.repository';
import { ChatMessageEntity } from './infra/gateways/entities/chat-message.entity';
import { MessageReactionEntity } from './infra/gateways/entities/message-reaction.entity';
import { TrackEntity } from '../tracks/infra/gateways/entities/track.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatMessageEntity,
      MessageReactionEntity,
      TrackEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ChatGateway,
    ChatService,
    ChatStatisticsService,
    ChatMessageRepository,
  ],
  exports: [ChatGateway, ChatService, ChatStatisticsService],
})
export class ChatModule {}
