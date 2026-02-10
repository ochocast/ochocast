import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import getEnv from '../utils/env';

interface UseSocketProps {
  trackId: string;
  username: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  trackId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  editedAt?: Date | null;
  reactions?: Reaction[];
}

export const useSocket = ({ trackId, username }: UseSocketProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get WebSocket URL from environment or default to API URL
    const wsUrl =
      getEnv('REACT_APP_WS_URL') ||
      `${getEnv('REACT_APP_API_URL')}:${getEnv('REACT_APP_API_PORT')}`;

    // Create socket connection
    const newSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);

      // Join the track room
      newSocket.emit('joinTrackRoom', { trackId, username });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    // Receive message history when joining
    newSocket.on('messageHistory', (history: ChatMessage[]) => {
      setMessages(history);
    });

    // Receive new messages
    newSocket.on('receiveMessage', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    // Message deleted
    newSocket.on('messageDeleted', (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== data.messageId));
    });

    // Message edited
    newSocket.on(
      'messageEdited',
      (data: { messageId: string; newContent: string; editedAt: Date }) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId
              ? { ...msg, message: data.newContent, editedAt: data.editedAt }
              : msg,
          ),
        );
      },
    );

    // Reaction added
    newSocket.on(
      'reactionAdded',
      (data: { messageId: string; userId: string; emoji: string }) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== data.messageId) return msg;

            const reactions = msg.reactions || [];
            const existingReaction = reactions.find(
              (r) => r.emoji === data.emoji,
            );

            if (existingReaction) {
              // Add user to existing reaction if not already present
              if (!existingReaction.userIds.includes(data.userId)) {
                return {
                  ...msg,
                  reactions: reactions.map((r) =>
                    r.emoji === data.emoji
                      ? {
                          ...r,
                          count: r.count + 1,
                          userIds: [...r.userIds, data.userId],
                        }
                      : r,
                  ),
                };
              }
              return msg;
            } else {
              // Add new reaction
              return {
                ...msg,
                reactions: [
                  ...reactions,
                  { emoji: data.emoji, count: 1, userIds: [data.userId] },
                ],
              };
            }
          }),
        );
      },
    );

    // Reaction removed
    newSocket.on(
      'reactionRemoved',
      (data: { messageId: string; userId: string; emoji: string }) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== data.messageId) return msg;

            const reactions = msg.reactions || [];
            const updatedReactions = reactions
              .map((r) => {
                if (r.emoji !== data.emoji) return r;
                const newUserIds = r.userIds.filter((id) => id !== data.userId);
                return {
                  ...r,
                  count: newUserIds.length,
                  userIds: newUserIds,
                };
              })
              .filter((r) => r.count > 0);

            return { ...msg, reactions: updatedReactions };
          }),
        );
      },
    );

    // User joined notification
    newSocket.on(
      'userJoined',
      (data: { username: string; timestamp: Date }) => {
        console.log(`${data.username} joined the chat`);
      },
    );

    // User left notification
    newSocket.on('userLeft', (data: { username: string; timestamp: Date }) => {
      console.log(`${data.username} left the chat`);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      if (newSocket) {
        newSocket.emit('leaveTrackRoom', { trackId, username });
        newSocket.disconnect();
      }
    };
  }, [trackId, username]);

  const sendMessage = useCallback(
    (message: string, userId: string) => {
      if (socket && isConnected) {
        socket.emit('sendMessage', {
          trackId,
          userId,
          username,
          message,
        });
      }
    },
    [socket, isConnected, trackId, username],
  );

  const deleteMessage = useCallback(
    (messageId: string, userId: string, isSpeaker: boolean) => {
      if (socket && isConnected) {
        socket.emit('deleteMessage', {
          messageId,
          trackId,
          userId,
          isSpeaker,
        });
      }
    },
    [socket, isConnected, trackId],
  );

  const editMessage = useCallback(
    (messageId: string, userId: string, newContent: string) => {
      if (socket && isConnected) {
        socket.emit('editMessage', {
          messageId,
          trackId,
          userId,
          newContent,
        });
      }
    },
    [socket, isConnected, trackId],
  );

  const addReaction = useCallback(
    (messageId: string, userId: string, emoji: string) => {
      if (socket && isConnected) {
        socket.emit('addReaction', {
          messageId,
          trackId,
          userId,
          emoji,
        });
      }
    },
    [socket, isConnected, trackId],
  );

  const removeReaction = useCallback(
    (messageId: string, userId: string, emoji: string) => {
      if (socket && isConnected) {
        socket.emit('removeReaction', {
          messageId,
          trackId,
          userId,
          emoji,
        });
      }
    },
    [socket, isConnected, trackId],
  );

  return {
    socket,
    messages,
    isConnected,
    sendMessage,
    deleteMessage,
    editMessage,
    addReaction,
    removeReaction,
  };
};
