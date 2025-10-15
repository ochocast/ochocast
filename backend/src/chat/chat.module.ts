import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './core/chat.service';
import { ChatMessageRepository } from './infra/gateways/chat-message.repository';
import { ChatMessageEntity } from './infra/gateways/entities/chat-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessageEntity])],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, ChatMessageRepository],
  exports: [ChatGateway, ChatService],
})
export class ChatModule {}
