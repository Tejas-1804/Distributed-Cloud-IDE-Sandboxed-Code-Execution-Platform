import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const isProd = process.env.NODE_ENV === 'production';

const fallbackAccessSecret = isTest
  ? 'test_access_secret_key_for_vitest_only_1234'
  : isProd
    ? crypto.randomBytes(32).toString('hex')
    : 'cloud_ide_dev_access_secret_change_in_production_2026';

const fallbackRefreshSecret = isTest
  ? 'test_refresh_secret_key_for_vitest_only_1234'
  : isProd
    ? crypto.randomBytes(32).toString('hex')
    : 'cloud_ide_dev_refresh_secret_change_in_production_2026';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().default(''),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DEV_ACCESS_MODE: z.boolean(),
  DOCKER_SOCKET_PATH: z.string().default(''),
  TERMINAL_MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(6),
  TERMINAL_MAX_SESSIONS_PER_WORKSPACE: z.coerce.number().int().positive().default(4),
  TERMINAL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  TERMINAL_MAX_OUTPUT_BUFFER_BYTES: z.coerce.number().int().positive().default(262144),
  TERMINAL_INPUT_RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().default(250),
  CONTAINER_MEMORY_LIMIT_MB: z.coerce.number().int().min(64).max(4096).default(256),
  CONTAINER_CPU_LIMIT: z.coerce.number().min(0.1).max(8).default(0.5),
  CONTAINER_PIDS_LIMIT: z.coerce.number().int().min(16).max(512).default(64),
  CONTAINER_MAX_ACTIVE: z.coerce.number().int().min(1).max(200).default(10),
  CONTAINER_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  CONTAINER_NETWORK_MODE: z.string().default('none'),
  CONTAINER_READONLY_ROOTFS: z.boolean().default(false),
});

const rawAccessSecret = process.env.JWT_ACCESS_SECRET?.trim();
const rawRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();

if (!isTest && (!rawAccessSecret || !rawRefreshSecret)) {
  console.warn(
    '[Env] JWT_ACCESS_SECRET / JWT_REFRESH_SECRET not set; using ephemeral/dev fallback secrets.',
  );
}

const resolvedNodeEnv =
  process.env.NODE_ENV === 'production'
    ? 'production'
    : isTest
      ? 'test'
      : 'development';

// Development single-user access mode is strictly disabled by default in production and tests.
// In local development, it defaults to true unless DEV_ACCESS_MODE=false is set.
const rawDevAccessMode = process.env.DEV_ACCESS_MODE?.trim().toLowerCase();
const devAccessMode =
  resolvedNodeEnv === 'production'
    ? false
    : resolvedNodeEnv === 'test'
      ? rawDevAccessMode === 'true'
      : rawDevAccessMode !== 'false';

if (devAccessMode && resolvedNodeEnv === 'development') {
  console.warn(
    '[Security] DEV_ACCESS_MODE is active for local single-user development (disabled by default in production).',
  );
}

const parsed = envSchema.safeParse({
  PORT: process.env.PORT,
  NODE_ENV: resolvedNodeEnv,
  MONGODB_URI: process.env.MONGODB_URI?.trim() ?? '',
  JWT_ACCESS_SECRET: rawAccessSecret || fallbackAccessSecret,
  JWT_REFRESH_SECRET: rawRefreshSecret || fallbackRefreshSecret,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY,
  FRONTEND_URL: process.env.FRONTEND_URL,
  DEV_ACCESS_MODE: devAccessMode,
  DOCKER_SOCKET_PATH: process.env.DOCKER_SOCKET_PATH?.trim() ?? '',
  TERMINAL_MAX_SESSIONS_PER_USER: process.env.TERMINAL_MAX_SESSIONS_PER_USER,
  TERMINAL_MAX_SESSIONS_PER_WORKSPACE: process.env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE,
  TERMINAL_IDLE_TIMEOUT_MS: process.env.TERMINAL_IDLE_TIMEOUT_MS,
  TERMINAL_MAX_OUTPUT_BUFFER_BYTES: process.env.TERMINAL_MAX_OUTPUT_BUFFER_BYTES,
  TERMINAL_INPUT_RATE_LIMIT_PER_SEC: process.env.TERMINAL_INPUT_RATE_LIMIT_PER_SEC,
  CONTAINER_MEMORY_LIMIT_MB: process.env.CONTAINER_MEMORY_LIMIT_MB,
  CONTAINER_CPU_LIMIT: process.env.CONTAINER_CPU_LIMIT,
  CONTAINER_PIDS_LIMIT: process.env.CONTAINER_PIDS_LIMIT,
  CONTAINER_MAX_ACTIVE: process.env.CONTAINER_MAX_ACTIVE,
  CONTAINER_IDLE_TIMEOUT_MS: process.env.CONTAINER_IDLE_TIMEOUT_MS,
  CONTAINER_NETWORK_MODE: process.env.CONTAINER_NETWORK_MODE?.trim() || 'none',
  CONTAINER_READONLY_ROOTFS:
    process.env.CONTAINER_READONLY_ROOTFS?.trim().toLowerCase() === 'true',
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid backend environment configuration:\n${details}`);
}

export const env = parsed.data;
