import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { Server } from 'socket.io';
import { initializeDatabase } from './utils/database';
import { initializeRedis } from './utils/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { setupWebSocket } from './websocket';
import fs from 'fs';

// Import routes
import authRoutes from './routes/auth.routes';
import campaignRoutes from './routes/campaign.routes';
import characterRoutes from './routes/character.routes';
import sessionRoutes from './routes/session.routes';
import dmRoutes from './routes/dm.routes';
import characterAbilitiesRoutes from './routes/characterAbilities.routes';

// Load .env from project root (works whether started in repo root, backend/, or Docker)
const envCandidates = [
  path.resolve(__dirname, '..', '..', '.env'), // ../.env when running from dist/
  path.resolve(process.cwd(), '.env'),        // current working directory
  path.resolve(process.cwd(), '..', '.env'),  // parent of cwd (previous behavior)
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
});

const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated audio files (TTS)
const audioPath = path.resolve(__dirname, '..', 'audio');
try { fs.mkdirSync(audioPath, { recursive: true }); } catch {}
app.use('/audio', express.static(audioPath));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/characters/:characterId/abilities', characterAbilitiesRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/dm', dmRoutes);

// Error handling
app.use(errorHandler);

// Initialize services
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis initialized');

    // Setup WebSocket handlers
    setupWebSocket(io);
    logger.info('WebSocket initialized');

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

export { app, io };
