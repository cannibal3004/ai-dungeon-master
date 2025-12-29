import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(undefined, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  joinSession(sessionId: string): void {
    if (this.socket) {
      this.socket.emit('join-session', sessionId);
    }
  }

  leaveSession(sessionId: string): void {
    if (this.socket) {
      this.socket.emit('leave-session', sessionId);
    }
  }

  sendAction(action: any): void {
    if (this.socket) {
      this.socket.emit('player-action', action);
    }
  }
}

export const wsService = new WebSocketService();
