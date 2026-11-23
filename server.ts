import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadBackendModules() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'backend/dist');
  const compiledAppPath = path.join(distDir, 'app.js');

  // Under plain `node server.ts` in production (without tsx), load compiled backend/dist/*.js
  if (isProd && fs.existsSync(compiledAppPath)) {
    const loadDist = (rel: string) => import(pathToFileURL(path.join(distDir, rel)).href);
    const [appMod, dbMod, envMod, socketMod, termMgrMod, cleanupMod] = await Promise.all([
      loadDist('app.js') as Promise<typeof import('./backend/src/app.ts')>,
      loadDist('config/database.js') as Promise<typeof import('./backend/src/config/database.ts')>,
      loadDist('config/env.js') as Promise<typeof import('./backend/src/config/env.ts')>,
      loadDist('websocket/socket.server.js') as Promise<typeof import('./backend/src/websocket/socket.server.ts')>,
      loadDist('terminal/terminal.manager.js') as Promise<typeof import('./backend/src/terminal/terminal.manager.ts')>,
      loadDist('docker/container.cleanup.js') as Promise<typeof import('./backend/src/docker/container.cleanup.ts')>,
    ]);
    return { ...appMod, ...dbMod, ...envMod, ...socketMod, ...termMgrMod, ...cleanupMod };
  }

  // Under `tsx server.ts` in development, load TypeScript backend modules directly
  const [appMod, dbMod, envMod, socketMod, termMgrMod, cleanupMod] = await Promise.all([
    import('./backend/src/app.ts'),
    import('./backend/src/config/database.ts'),
    import('./backend/src/config/env.ts'),
    import('./backend/src/websocket/socket.server.ts'),
    import('./backend/src/terminal/terminal.manager.ts'),
    import('./backend/src/docker/container.cleanup.ts'),
  ]);
  return { ...appMod, ...dbMod, ...envMod, ...socketMod, ...termMgrMod, ...cleanupMod };
}

async function startServer(): Promise<void> {
  const {
    createApp,
    errorHandler,
    resolveAndConnectDatabase,
    disconnectDatabase,
    env,
    initSocketServer,
    terminalManager,
    startContainerCleanupScheduler,
    stopContainerCleanupScheduler,
  } = await loadBackendModules();

  await resolveAndConnectDatabase(env.MONGODB_URI);

  const app = createApp({ includeFallbackHandlers: false });
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);
  startContainerCleanupScheduler();

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir) as unknown as Parameters<typeof app.use>[0]);
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[Cloud IDE] Full-stack server running on http://0.0.0.0:${port}`);
  });

  const shutdown = async () => {
    stopContainerCleanupScheduler();
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

startServer().catch((err) => {
  console.error('[Cloud IDE] Failed to start server:', err);
  process.exit(1);
});
