import http from 'http';
import { createApp } from './app.js';
import { disconnectDatabase, resolveAndConnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import {
  startContainerCleanupScheduler,
  stopContainerCleanupScheduler,
} from './docker/container.cleanup.js';
import { collabService } from './collab/collab.service.js';
import { executionManager } from './execution/execution.manager.js';
import { lspManager } from './lsp/lsp.manager.js';
import { terminalManager } from './terminal/terminal.manager.js';
import { initSocketServer } from './websocket/socket.server.js';

async function bootstrap(): Promise<void> {
  await resolveAndConnectDatabase(env.MONGODB_URI);

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);
  startContainerCleanupScheduler();

  httpServer.listen(env.PORT, () => {
    console.log(`[Backend] Express + Socket.IO server listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[Backend] Shutting down gracefully...');
    stopContainerCleanupScheduler();
    await executionManager.stopAll();
    lspManager.closeAll();
    await collabService.closeAll();
    await terminalManager.closeAll();
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
