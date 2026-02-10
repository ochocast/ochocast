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
import { Logger, Optional } from '@nestjs/common';
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
      const savedMessage = await this.chatService.saveMessage(messageDto);

      // Create response with id
      const responseMessage: ChatMessageDto = {
        id: savedMessage.id,
        trackId: messageDto.trackId,
        userId: messageDto.userId,
        username: messageDto.username,
        message: messageDto.message,
        timestamp: messageDto.timestamp,
        editedAt: null,
        reactions: [],
      };

      // Broadcast message to all clients in the room (including sender)
      this.server.to(trackId).emit('receiveMessage', responseMessage);

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

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody()
    data: {
      messageId: string;
      trackId: string;
      userId: string;
      isSpeaker: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { messageId, trackId, userId, isSpeaker } = data;

    try {
      // Get the message to check ownership
      const message = await this.chatService.getMessageById(messageId);

      if (!message) {
        this.logger.warn(`Message ${messageId} not found for deletion`);
        return;
      }

      // Check if user can delete: own message OR is speaker
      if (message.userId !== userId && !isSpeaker) {
        this.logger.warn(
          `User ${userId} not authorized to delete message ${messageId}`,
        );
        client.emit('error', {
          message: 'Not authorized to delete this message',
        });
        return;
      }

      // Delete the message
      await this.chatService.deleteMessage(messageId);

      // Broadcast deletion to all clients in the room
      this.server.to(trackId).emit('messageDeleted', { messageId });

      this.logger.log(
        `Message ${messageId} deleted in track ${trackId} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete message ${messageId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to delete message' });
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @MessageBody()
    data: {
      messageId: string;
      trackId: string;
      userId: string;
      newContent: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { messageId, trackId, userId, newContent } = data;

    try {
      // Get the message to check ownership
      const message = await this.chatService.getMessageById(messageId);

      if (!message) {
        this.logger.warn(`Message ${messageId} not found for editing`);
        return;
      }

      // Only the message owner can edit
      if (message.userId !== userId) {
        this.logger.warn(
          `User ${userId} not authorized to edit message ${messageId}`,
        );
        client.emit('error', {
          message: 'Not authorized to edit this message',
        });
        return;
      }

      // Validate content
      if (!newContent || newContent.trim().length === 0) {
        client.emit('error', { message: 'Message content cannot be empty' });
        return;
      }

      // Update the message
      const updatedMessage = await this.chatService.updateMessage(
        messageId,
        newContent.trim(),
      );

      if (!updatedMessage) {
        client.emit('error', { message: 'Failed to update message' });
        return;
      }

      // Broadcast edit to all clients in the room
      this.server.to(trackId).emit('messageEdited', {
        messageId,
        newContent: updatedMessage.message,
        editedAt: updatedMessage.editedAt,
      });

      this.logger.log(
        `Message ${messageId} edited in track ${trackId} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to edit message ${messageId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to edit message' });
    }
  }

  @SubscribeMessage('addReaction')
  async handleAddReaction(
    @MessageBody()
    data: {
      messageId: string;
      trackId: string;
      userId: string;
      emoji: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { messageId, trackId, userId, emoji } = data;

    try {
      // Add the reaction
      await this.chatService.addReaction(messageId, userId, emoji);

      // Broadcast reaction to all clients in the room
      this.server.to(trackId).emit('reactionAdded', {
        messageId,
        userId,
        emoji,
      });

      this.logger.log(
        `Reaction ${emoji} added to message ${messageId} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add reaction to message ${messageId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to add reaction' });
    }
  }

  @SubscribeMessage('removeReaction')
  async handleRemoveReaction(
    @MessageBody()
    data: {
      messageId: string;
      trackId: string;
      userId: string;
      emoji: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { messageId, trackId, userId, emoji } = data;

    try {
      // Remove the reaction
      await this.chatService.removeReaction(messageId, userId, emoji);

      // Broadcast reaction removal to all clients in the room
      this.server.to(trackId).emit('reactionRemoved', {
        messageId,
        userId,
        emoji,
      });

      this.logger.log(
        `Reaction ${emoji} removed from message ${messageId} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove reaction from message ${messageId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to remove reaction' });
    }
  }

  @SubscribeMessage('pollCreated')
  async handlePollCreated(
    @MessageBody() data: { trackId: string; poll: any },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, poll } = data;
    this.logger.log(`Poll created in track ${trackId}`);
    // Broadcast poll creation to all clients in the track room
    this.server.to(trackId).emit('pollCreated', poll);
  }

  @SubscribeMessage('pollAnswered')
  async handlePollAnswered(
    @MessageBody() data: { trackId: string; poll: any },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, poll } = data;
    this.logger.log(`Poll answered in track ${trackId}, poll ${poll.id}`);
    // Broadcast poll update to all clients in the track room
    this.server.to(trackId).emit('pollAnswered', poll);
  }

  @SubscribeMessage('pollClosed')
  async handlePollClosed(
    @MessageBody() data: { trackId: string; pollId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { trackId, pollId } = data;
    this.logger.log(`Poll closed in track ${trackId}, poll ${pollId}`);
    // Broadcast poll closure to all clients in the track room
    this.server.to(trackId).emit('pollClosed', { pollId });
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

  /**
   * Broadcast poll closure to all clients in a track room.
   * Called by PollTimerService when a poll timer expires.
   */
  broadcastPollClosed(trackId: string, pollId: string): void {
    this.logger.log(
      `Broadcasting poll closure: trackId=${trackId}, pollId=${pollId}`,
    );
    this.server.to(trackId).emit('pollClosed', { pollId });
  }
}
