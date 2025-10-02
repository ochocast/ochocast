import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketProps {
  trackId: string;
  username: string;
}

export interface ChatMessage {
  trackId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
}

export const useSocket = ({ trackId, username }: UseSocketProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get WebSocket URL from environment or default to API URL
    const wsUrl =
      process.env.REACT_APP_WS_URL ||
      `${process.env.REACT_APP_API_URL}:${process.env.REACT_APP_API_PORT}`;

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

  const sendMessage = (message: string, userId: string) => {
    if (socket && isConnected) {
      socket.emit('sendMessage', {
        trackId,
        userId,
        username,
        message,
      });
    }
  };

  return {
    socket,
    messages,
    isConnected,
    sendMessage,
  };
};
