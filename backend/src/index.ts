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

// Streaming audio proxy for TTS
import { getTTSService } from './services/TTSService';

// HEAD: expose cache path without consuming token
app.head('/audio/stream/:token', async (req, res, next): Promise<void> => {
  try {
    const ttsService = getTTSService();
    const { token } = req.params;
    const tokenData = ttsService.peekStreamToken(token);
    if (!tokenData) {
      res.status(404).end();
      return;
    }
    const cachePath = `/audio/${tokenData.sessionId}/${tokenData.cacheFilename}`;
    res.setHeader('X-Audio-Cache-Path', cachePath);
    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

app.get('/audio/stream/:token', async (req, res, next): Promise<void> => {
  try {
    const ttsService = getTTSService();
    const { token } = req.params;
    logger.info('[Audio] Stream token request', { token, availableTokens: (ttsService as any).pendingStreams?.size });
    const tokenData = ttsService.consumeStreamToken(token);
    if (!tokenData) {
      logger.warn('[Audio] Token not found', { token });
      res.status(404).json({ error: 'Invalid or expired stream token' });
      return;
    }

    logger.info('[Audio] Token consumed, streaming', { token, sessionId: tokenData.sessionId, cacheFilename: tokenData.cacheFilename });
    const result = await ttsService.streamAudioDirect(tokenData.sessionId, tokenData.text, tokenData.cacheFilename);
    if (!result) {
      logger.error('[Audio] Failed to stream audio');
      res.status(500).json({ error: 'Failed to stream audio' });
      return;
    }

    // Set headers for streaming without Content-Length
    const contentTypeMap: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'pcm': 'audio/wave',
    };
    res.setHeader('Content-Type', contentTypeMap[result.format] || 'audio/wav');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('Content-Length');
    
    // Send cached filename so client can use it for replay
    if (result.cacheFilename) {
      const cachePath = `/audio/${tokenData.sessionId}/${result.cacheFilename}`;
      res.setHeader('X-Audio-Cache-Path', cachePath);
    }

    let sentBytes = 0;
    let sentChunks = 0;
    result.stream.on('data', (chunk: Buffer) => {
      sentChunks += 1;
      sentBytes += chunk.length;
      if (sentChunks === 1 || sentChunks % 10 === 0) {
        logger.info('[Audio] Streaming to client', { token, sentChunks, sentBytes });
      }
    });

    res.on('close', () => {
      logger.info('[Audio] Client closed stream', { token, sentChunks, sentBytes });
    });

    res.on('finish', () => {
      logger.info('[Audio] Stream finished to client', { token, sentChunks, sentBytes, cacheFilename: result.cacheFilename });
    });

    result.stream.pipe(res);

    result.stream.on('error', (err: any) => {
      logger.error('[Audio] Stream error', { error: err.message });
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
  } catch (err) {
    next(err);
  }
});

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
