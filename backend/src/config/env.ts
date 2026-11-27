import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// ---------------------------------------------------------
// Load environment variables
// ---------------------------------------------------------

const envFile = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

// ---------------------------------------------------------
// Environment mode
// ---------------------------------------------------------

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true';

const resolvedNodeEnv =
  process.env.NODE_ENV === 'production'
    ? 'production'
    : isTest
      ? 'test'
      : 'development';

const isProd = resolvedNodeEnv === 'production';

// ---------------------------------------------------------
// JWT fallback secrets
// ---------------------------------------------------------

const fallbackAccessSecret = isTest
  ? 'test_access_secret_key_for_vitest_only_123456789'
  : 'cloud_ide_dev_access_secret_change_in_production_2026';

const fallbackRefreshSecret = isTest
  ? 'test_refresh_secret_key_for_vitest_only_123456789'
  : 'cloud_ide_dev_refresh_secret_change_in_production_2026';

// ---------------------------------------------------------
// Raw environment values
// ---------------------------------------------------------

const rawAccessSecret =
  process.env.JWT_ACCESS_SECRET?.trim();

const rawRefreshSecret =
  process.env.JWT_REFRESH_SECRET?.trim();

const mongodbUri =
  process.env.MONGODB_URI?.trim() ?? '';

const frontendUrl =
  process.env.FRONTEND_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  'http://localhost:3000';

const viteApiUrl =
  process.env.VITE_API_URL?.trim() ||
  'http://localhost:4000/api';

const geminiApiKey =
  process.env.GEMINI_API_KEY?.trim() ?? '';

const rawDevAccessMode =
  process.env.DEV_ACCESS_MODE?.trim().toLowerCase();

const devAccessMode =
  resolvedNodeEnv === 'production'
    ? false
    : resolvedNodeEnv === 'test'
      ? rawDevAccessMode === 'true'
      : rawDevAccessMode !== 'false';

// ---------------------------------------------------------
// JWT configuration validation
// ---------------------------------------------------------

if (
  !isTest &&
  (!rawAccessSecret || !rawRefreshSecret)
) {
  if (isProd) {
    throw new Error(
      '[Env] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production.',
    );
  }

  console.warn(
    '[Env] JWT secrets are not configured. Using development fallback secrets.',
  );
}

// ---------------------------------------------------------
// Environment schema
// ---------------------------------------------------------

const envSchema = z.object({
  // -------------------------------------------------------
  // Application
  // -------------------------------------------------------

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  NODE_ENV: z
    .enum([
      'development',
      'production',
      'test',
    ])
    .default('development'),

  FRONTEND_URL: z
    .string()
    .url('FRONTEND_URL must be a valid URL')
    .default('http://localhost:3000'),

  VITE_API_URL: z
    .string()
    .url('VITE_API_URL must be a valid URL')
    .default('http://localhost:4000/api'),

  // -------------------------------------------------------
  // Database
  // -------------------------------------------------------

  MONGODB_URI: z
    .string()
    .default(''),

  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------

  JWT_ACCESS_SECRET: z
    .string()
    .min(
      16,
      'JWT_ACCESS_SECRET must be at least 16 characters',
    ),

  JWT_REFRESH_SECRET: z
    .string()
    .min(
      16,
      'JWT_REFRESH_SECRET must be at least 16 characters',
    ),

  ACCESS_TOKEN_EXPIRY: z
    .string()
    .min(1)
    .default('15m'),

  REFRESH_TOKEN_EXPIRY: z
    .string()
    .min(1)
    .default('7d'),

  DEV_ACCESS_MODE: z
    .boolean()
    .default(false),

  // -------------------------------------------------------
  // AI integration
  // -------------------------------------------------------

  GEMINI_API_KEY: z
    .string()
    .default(''),

  // -------------------------------------------------------
  // Docker / Execution
  // -------------------------------------------------------

  DOCKER_SOCKET_PATH: z
    .string()
    .default(''),

  EXECUTION_MAX_CONCURRENT_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(3),

  EXECUTION_MAX_OUTPUT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),

  EXECUTION_HISTORY_SUMMARY_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  EXECUTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),

  EXECUTION_COMPILE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),

  // -------------------------------------------------------
  // Terminal
  // -------------------------------------------------------

  TERMINAL_MAX_SESSIONS_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(6),

  TERMINAL_MAX_SESSIONS_PER_WORKSPACE: z.coerce
    .number()
    .int()
    .positive()
    .default(4),

  TERMINAL_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),

  TERMINAL_MAX_OUTPUT_BUFFER_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(262144),

  TERMINAL_INPUT_RATE_LIMIT_PER_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(250),

  // -------------------------------------------------------
  // LSP
  // -------------------------------------------------------

  LSP_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),

  LSP_MAX_PROCESSES: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  // -------------------------------------------------------
  // Container resource limits
  // -------------------------------------------------------

  CONTAINER_MEMORY_LIMIT_MB: z.coerce
    .number()
    .int()
    .min(64)
    .max(4096)
    .default(256),

  CONTAINER_CPU_LIMIT: z.coerce
    .number()
    .min(0.1)
    .max(8)
    .default(0.5),

  CONTAINER_PIDS_LIMIT: z.coerce
    .number()
    .int()
    .min(16)
    .max(512)
    .default(64),

  CONTAINER_MAX_ACTIVE: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(10),

  CONTAINER_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),

  CONTAINER_NETWORK_MODE: z
    .string()
    .default('none'),

  CONTAINER_READONLY_ROOTFS: z
    .boolean()
    .default(false),
});

// ---------------------------------------------------------
// Development security warning
// ---------------------------------------------------------

if (
  devAccessMode &&
  resolvedNodeEnv === 'development'
) {
  console.warn(
    '[Security] DEV_ACCESS_MODE is active for local single-user development.',
  );
}

// ---------------------------------------------------------
// Parse and validate environment
// ---------------------------------------------------------

const parsed = envSchema.safeParse({
  // Application
  PORT: process.env.PORT,

  NODE_ENV: resolvedNodeEnv,

  FRONTEND_URL: frontendUrl,

  VITE_API_URL: viteApiUrl,

  // Database
  MONGODB_URI: mongodbUri,

  // Authentication
  JWT_ACCESS_SECRET:
    rawAccessSecret ||
    fallbackAccessSecret,

  JWT_REFRESH_SECRET:
    rawRefreshSecret ||
    fallbackRefreshSecret,

  ACCESS_TOKEN_EXPIRY:
    process.env.ACCESS_TOKEN_EXPIRY,

  REFRESH_TOKEN_EXPIRY:
    process.env.REFRESH_TOKEN_EXPIRY,

  DEV_ACCESS_MODE:
    devAccessMode,

  // AI
  GEMINI_API_KEY:
    geminiApiKey,

  // Docker / Execution
  DOCKER_SOCKET_PATH:
    process.env.DOCKER_SOCKET_PATH?.trim() ?? '',

  EXECUTION_MAX_CONCURRENT_PER_USER:
    process.env.EXECUTION_MAX_CONCURRENT_PER_USER,

  EXECUTION_MAX_OUTPUT_BYTES:
    process.env.EXECUTION_MAX_OUTPUT_BYTES,

  EXECUTION_HISTORY_SUMMARY_CHARS:
    process.env.EXECUTION_HISTORY_SUMMARY_CHARS,

  EXECUTION_TIMEOUT_MS:
    process.env.EXECUTION_TIMEOUT_MS,

  EXECUTION_COMPILE_TIMEOUT_MS:
    process.env.EXECUTION_COMPILE_TIMEOUT_MS,

  // Terminal
  TERMINAL_MAX_SESSIONS_PER_USER:
    process.env.TERMINAL_MAX_SESSIONS_PER_USER,

  TERMINAL_MAX_SESSIONS_PER_WORKSPACE:
    process.env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE,

  TERMINAL_IDLE_TIMEOUT_MS:
    process.env.TERMINAL_IDLE_TIMEOUT_MS,

  TERMINAL_MAX_OUTPUT_BUFFER_BYTES:
    process.env.TERMINAL_MAX_OUTPUT_BUFFER_BYTES,

  TERMINAL_INPUT_RATE_LIMIT_PER_SEC:
    process.env.TERMINAL_INPUT_RATE_LIMIT_PER_SEC,

  // LSP
  LSP_IDLE_TIMEOUT_MS:
    process.env.LSP_IDLE_TIMEOUT_MS,

  LSP_MAX_PROCESSES:
    process.env.LSP_MAX_PROCESSES,

  // Containers
  CONTAINER_MEMORY_LIMIT_MB:
    process.env.CONTAINER_MEMORY_LIMIT_MB,

  CONTAINER_CPU_LIMIT:
    process.env.CONTAINER_CPU_LIMIT,

  CONTAINER_PIDS_LIMIT:
    process.env.CONTAINER_PIDS_LIMIT,

  CONTAINER_MAX_ACTIVE:
    process.env.CONTAINER_MAX_ACTIVE,

  CONTAINER_IDLE_TIMEOUT_MS:
    process.env.CONTAINER_IDLE_TIMEOUT_MS,

  CONTAINER_NETWORK_MODE:
    process.env.CONTAINER_NETWORK_MODE?.trim() ||
    'none',

  CONTAINER_READONLY_ROOTFS:
    process.env.CONTAINER_READONLY_ROOTFS
      ?.trim()
      .toLowerCase() === 'true',
});

// ---------------------------------------------------------
// Validation errors
// ---------------------------------------------------------

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => {
      const field =
        issue.path.length > 0
          ? issue.path.join('.')
          : 'environment';

      return `  - ${field}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(
    `Invalid backend environment configuration:\n${details}`,
  );
}

// ---------------------------------------------------------
// Export validated environment
// ---------------------------------------------------------

export const env = parsed.data;

// ---------------------------------------------------------
// Development startup diagnostics
// ---------------------------------------------------------

if (!isProd && !isTest) {
  console.log(
    `[Env] Environment loaded from: ${envFile}`,
  );

  console.log(
    `[Env] NODE_ENV: ${env.NODE_ENV}`,
  );

  console.log(
    `[Env] Backend port: ${env.PORT}`,
  );

  console.log(
    `[Env] Frontend URL: ${env.FRONTEND_URL}`,
  );

  console.log(
    `[Env] API URL: ${env.VITE_API_URL}`,
  );

  console.log(
    `[Env] JWT access secret: ${
      rawAccessSecret
        ? 'configured'
        : 'development fallback'
    }`,
  );

  console.log(
    `[Env] JWT refresh secret: ${
      rawRefreshSecret
        ? 'configured'
        : 'development fallback'
    }`,
  );

  console.log(
    `[Env] MongoDB: ${
      env.MONGODB_URI
        ? 'configured'
        : 'embedded/fallback database'
    }`,
  );

  console.log(
    `[Env] Gemini API: ${
      env.GEMINI_API_KEY
        ? 'configured'
        : 'not configured'
    }`,
  );

  console.log(
    `[Env] Docker socket: ${
      env.DOCKER_SOCKET_PATH ||
      'default'
    }`,
  );

  console.log(
    `[Env] Development access mode: ${
      env.DEV_ACCESS_MODE
    }`,
  );

  console.log(
    `[Env] Max concurrent executions/user: ${
      env.EXECUTION_MAX_CONCURRENT_PER_USER
    }`,
  );

  console.log(
    `[Env] Execution timeout: ${
      env.EXECUTION_TIMEOUT_MS
    }ms`,
  );

  console.log(
    `[Env] LSP max processes: ${
      env.LSP_MAX_PROCESSES
    }`,
  );
}
