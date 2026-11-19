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
});

const rawAccessSecret = process.env.JWT_ACCESS_SECRET?.trim();
const rawRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();

if (!isTest && (!rawAccessSecret || !rawRefreshSecret)) {
  console.warn(
    '[Env] JWT_ACCESS_SECRET / JWT_REFRESH_SECRET not set; using ephemeral/dev fallback secrets.',
  );
}

const parsed = envSchema.safeParse({
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI?.trim() ?? '',
  JWT_ACCESS_SECRET: rawAccessSecret || fallbackAccessSecret,
  JWT_REFRESH_SECRET: rawRefreshSecret || fallbackRefreshSecret,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY,
  FRONTEND_URL: process.env.FRONTEND_URL,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid backend environment configuration:\n${details}`);
}

export const env = parsed.data;
