import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatMessageDto } from './dto/chat-message.dto';
import { Logger } from '@nestjs/common';
import { ChatService } from './core/chat.service';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      //'https://prod-frontend.s3-website.fr-par.scw.cloud',
      'https://demo.ochocast.fr',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinTrackRoom')
  async handleJoinRoom(
    @MessageBody() data: { trackId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, username } = data;
    client.join(trackId);
    this.logger.log(
      `Client ${client.id} (${username}) joined track room: ${trackId}`,
    );

    // Send existing messages from database to the newly joined client
    const existingMessages = await this.chatService.getTrackMessages(trackId);
    client.emit('messageHistory', existingMessages);

    // Notify others in the room
    client.to(trackId).emit('userJoined', {
      username,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('leaveTrackRoom')
  handleLeaveRoom(
    @MessageBody() data: { trackId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, username } = data;
    client.leave(trackId);
    this.logger.log(
      `Client ${client.id} (${username}) left track room: ${trackId}`,
    );

    // Notify others in the room
    client.to(trackId).emit('userLeft', {
      username,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() messageDto: ChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId } = messageDto;

    // Add timestamp
    messageDto.timestamp = new Date();

    try {
      // Save message to database
      await this.chatService.saveMessage(messageDto);

      // Broadcast message to all clients in the room (including sender)
      this.server.to(trackId).emit('receiveMessage', messageDto);

      this.logger.log(
        `Message sent in track ${trackId} by ${messageDto.username}: ${messageDto.message}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save message for track ${trackId}: ${error.message}`,
      );
      // Still broadcast the message even if save fails to maintain real-time experience
      this.server.to(trackId).emit('receiveMessage', messageDto);
    }
  }

  // Optional: Clean up messages from database
  async clearTrackMessages(trackId: string) {
    try {
      await this.chatService.clearTrackMessages(trackId);
      this.logger.log(`Messages cleared for track: ${trackId}`);
    } catch (error) {
      this.logger.error(
        `Failed to clear messages for track ${trackId}: ${error.message}`,
      );
    }
  }
}
