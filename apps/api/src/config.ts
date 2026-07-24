import { z } from 'zod';

const booleanValue = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().min(1),
  DB_SSL: booleanValue,
  DB_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_COOKIE_NAME: z.string().min(1).default('rs_session'),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(120),
  SHIPPING_FEE_CENTS: z.coerce.number().int().min(0).default(0),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  COOKIE_DOMAIN: parsed.COOKIE_DOMAIN?.trim() || undefined,
  corsOrigins: parsed.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  sessionTtlMs: parsed.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  secureCookies: parsed.NODE_ENV === 'production',
} as const;
