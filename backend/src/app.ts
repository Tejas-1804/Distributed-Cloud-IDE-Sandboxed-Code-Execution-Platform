import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import containerRoutes from './routes/containerRoutes.js';
import executionRoutes from './routes/executionRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import monitoringRoutes from './routes/monitoringRoutes.js';
import terminalRoutes from './routes/terminalRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';

export interface CreateAppOptions {
  includeFallbackHandlers?: boolean;
}

export function createApp(options: CreateAppOptions = {}) {
  const { includeFallbackHandlers = true } = options;
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = env.FRONTEND_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        const isLocalDevelopmentOrigin = (() => {
          if (env.NODE_ENV === 'production' || !origin) return false;
          try {
            const hostname = new URL(origin).hostname;
            return ['localhost', '127.0.0.1', '::1'].includes(hostname);
          } catch {
            return false;
          }
        })();

        if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/api', apiRateLimiter);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/containers', containerRoutes);
  app.use('/api/terminal', terminalRoutes);
  app.use('/api/execution', executionRoutes);
  app.use('/api/monitoring', monitoringRoutes);

  if (includeFallbackHandlers) {
    app.use(notFoundHandler);
    app.use(errorHandler);
  } else {
    app.use('/api', notFoundHandler);
  }

  return app;
}

export { errorHandler };
