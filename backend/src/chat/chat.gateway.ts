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

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'https://prod-frontend.s3-website.fr-par.scw.cloud',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Store messages in memory per track (lost on server restart)
  private messages: Map<string, ChatMessageDto[]> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinTrackRoom')
  handleJoinRoom(
    @MessageBody() data: { trackId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, username } = data;
    client.join(trackId);
    this.logger.log(
      `Client ${client.id} (${username}) joined track room: ${trackId}`,
    );

    // Send existing messages to the newly joined client
    const existingMessages = this.messages.get(trackId) || [];
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
  handleMessage(
    @MessageBody() messageDto: ChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId } = messageDto;

    // Add timestamp
    messageDto.timestamp = new Date();

    // Store message in memory
    if (!this.messages.has(trackId)) {
      this.messages.set(trackId, []);
    }
    this.messages.get(trackId).push(messageDto);

    // Broadcast message to all clients in the room (including sender)
    this.server.to(trackId).emit('receiveMessage', messageDto);

    this.logger.log(
      `Message sent in track ${trackId} by ${messageDto.username}: ${messageDto.message}`,
    );
  }

  // Optional: Clean up old messages to prevent memory leak
  clearTrackMessages(trackId: string) {
    this.messages.delete(trackId);
    this.logger.log(`Messages cleared for track: ${trackId}`);
  }
}
