
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------
// Load backend modules
// ---------------------------------------------------------

async function loadBackendModules() {
  const isProd = process.env.NODE_ENV === 'production';

  const distDir = path.resolve(__dirname, 'backend/dist');
  const compiledAppPath = path.join(distDir, 'app.js');

  if (isProd && fs.existsSync(compiledAppPath)) {
    const loadDist = (rel: string) =>
      import(pathToFileURL(path.join(distDir, rel)).href);

    const [
      appMod,
      dbMod,
      envMod,
      socketMod,
      termMgrMod,
      cleanupMod,
      jwtMod,
    ] = await Promise.all([
      loadDist('app.js'),
      loadDist('config/database.js'),
      loadDist('config/env.js'),
      loadDist('websocket/socket.server.js'),
      loadDist('terminal/terminal.manager.js'),
      loadDist('docker/container.cleanup.js'),
      loadDist('utils/jwt.js'),
    ]);

    return {
      ...appMod,
      ...dbMod,
      ...envMod,
      ...socketMod,
      ...termMgrMod,
      ...cleanupMod,
      ...jwtMod,
    };
  }

  // Development: load TypeScript modules directly through tsx.

  const [
    appMod,
    dbMod,
    envMod,
    socketMod,
    termMgrMod,
    cleanupMod,
    jwtMod,
  ] = await Promise.all([
    import('./backend/src/app.ts'),
    import('./backend/src/config/database.ts'),
    import('./backend/src/config/env.ts'),
    import('./backend/src/websocket/socket.server.ts'),
    import('./backend/src/terminal/terminal.manager.ts'),
    import('./backend/src/docker/container.cleanup.ts'),
    import('./backend/src/utils/jwt.ts'),
  ]);

  return {
    ...appMod,
    ...dbMod,
    ...envMod,
    ...socketMod,
    ...termMgrMod,
    ...cleanupMod,
    ...jwtMod,
  };
}

// ---------------------------------------------------------
// Start application server
// ---------------------------------------------------------

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

  // -------------------------------------------------------
  // Connect database
  // -------------------------------------------------------

  await resolveAndConnectDatabase(env.MONGODB_URI);

  console.log('[Cloud IDE] Database connection established.');

  // -------------------------------------------------------
  // Initialize Express
  // -------------------------------------------------------

  const app = createApp({
    includeFallbackHandlers: false,
  });

  const httpServer = http.createServer(app);

  // -------------------------------------------------------
  // Initialize Socket.IO
  // -------------------------------------------------------

  const io = initSocketServer(httpServer);

  console.log('[Cloud IDE] Socket.IO initialized.');

  // -------------------------------------------------------
  // Initialize Docker cleanup scheduler
  // -------------------------------------------------------

  startContainerCleanupScheduler();

  console.log('[Cloud IDE] Container cleanup scheduler started.');

  // -------------------------------------------------------
  // Development / Production configuration
  // -------------------------------------------------------

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Development: Vite middleware

    const { createServer: createViteServer } =
      await import('vite');

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    console.log('[Cloud IDE] Vite development middleware enabled.');
  } else {
    // Production: Serve frontend build

    const distDir = path.resolve(__dirname, 'dist');

    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      throw new Error(
        `[Cloud IDE] Frontend build not found: ${distDir}`,
      );
    }

    app.use(
      express.static(distDir) as unknown as Parameters<typeof app.use>[0],
    );

    app.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });

    console.log('[Cloud IDE] Production frontend enabled.');
  }

  // -------------------------------------------------------
  // Error handler
  // -------------------------------------------------------

  app.use(errorHandler);

  // -------------------------------------------------------
  // Start HTTP server
  // -------------------------------------------------------

  const port = env.PORT;

  httpServer.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('========================================');
    console.log('       Distributed Cloud IDE');
    console.log('========================================');
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Backend:     http://localhost:${port}`);
    console.log(`API:         http://localhost:${port}/api`);
    console.log('Socket.IO:   enabled');
    console.log('Docker:      enabled');
    console.log('========================================');
    console.log('');
  });

  // -------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log('');
    console.log(`[Cloud IDE] Received ${signal}.`);
    console.log('[Cloud IDE] Starting graceful shutdown...');

    try {
      // Stop new container cleanup tasks.
      stopContainerCleanupScheduler();

      // Close active terminal sessions.
      await terminalManager.closeAll();

      console.log('[Cloud IDE] Terminal sessions closed.');

      // Close Socket.IO connections.
      io.close();

      console.log('[Cloud IDE] Socket.IO connections closed.');

      // Close HTTP server and database.
      httpServer.close(async (error) => {
        if (error) {
          console.error(
            '[Cloud IDE] HTTP server shutdown error:',
            error,
          );
        }

        try {
          await disconnectDatabase();

          console.log('[Cloud IDE] Database disconnected.');
          console.log('[Cloud IDE] Shutdown completed.');

          process.exit(0);
        } catch (dbError) {
          console.error(
            '[Cloud IDE] Database shutdown error:',
            dbError,
          );

          process.exit(1);
        }
      });
    } catch (error) {
      console.error(
        '[Cloud IDE] Graceful shutdown failed:',
        error,
      );

      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

// ---------------------------------------------------------
// Application entry point
// ---------------------------------------------------------

startServer().catch((error) => {
  console.error('');
  console.error('[Cloud IDE] Failed to start server:');
  console.error(error);
  console.error('');

  process.exit(1);
});
