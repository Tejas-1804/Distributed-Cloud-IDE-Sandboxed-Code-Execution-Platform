import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { disconnectDatabase, resolveAndConnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { verifyAccessToken } from './utils/jwt.js';

async function bootstrap(): Promise<void> {
  await resolveAndConnectDatabase(env.MONGODB_URI);

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.IO foundation for Phases 4 & 6 (interactive terminal + Yjs collaboration)
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Socket authentication token required'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error('Invalid or expired socket authentication token'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('ide:ready', {
      userId: socket.data.userId,
      phase: 2,
      message: 'Socket.IO foundation authenticated. Terminal & collaboration streams connect in Phases 4–6.',
    });
  });

  httpServer.listen(env.PORT, () => {
    console.log(`[Backend] Express + Socket.IO server listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[Backend] Shutting down gracefully...');
    io.close();
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  console.error('[Backend] Startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
