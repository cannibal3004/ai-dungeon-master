import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { setupGameEvents } from './gameEvents';

export function setupWebSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join campaign room
    socket.on('join-campaign', (campaignId: string, userId: string) => {
      socket.join(`campaign:${campaignId}`);
      (socket as any).userId = userId;
      (socket as any).campaignId = campaignId;
      logger.info(`User ${userId} (socket ${socket.id}) joined campaign ${campaignId}`);
      
      socket.to(`campaign:${campaignId}`).emit('player-joined', {
        userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    // Leave campaign room
    socket.on('leave-campaign', (campaignId: string) => {
      const userId = (socket as any).userId;
      socket.leave(`campaign:${campaignId}`);
      logger.info(`User ${userId} (socket ${socket.id}) left campaign ${campaignId}`);
      
      socket.to(`campaign:${campaignId}`).emit('player-left', {
        userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    // Setup game event handlers
    setupGameEvents(io, socket);

    // Disconnect
    socket.on('disconnect', () => {
      const userId = (socket as any).userId;
      const campaignId = (socket as any).campaignId;
      
      if (campaignId) {
        socket.to(`campaign:${campaignId}`).emit('player-disconnected', {
          userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      }
      
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  logger.info('WebSocket handlers registered');
}
