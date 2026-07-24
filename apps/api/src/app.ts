import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { cartRoutes } from './routes/cart.js';
import { catalogRoutes } from './routes/catalog.js';
import { healthRoutes } from './routes/health.js';
import { orderRoutes } from './routes/orders.js';
import { quoteRoutes } from './routes/quotes.js';
import { settingsRoutes } from './routes/settings.js';

interface PostgresError {
  code?: string;
  constraint?: string;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'password',
          '*.password',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
    keepAliveTimeout: 72_000,
  });

  await app.register(cookie, {
    secret: config.SESSION_SECRET,
    hook: 'onRequest',
  });

  await app.register(cors, {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Requested-With'],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'), false);
    },
  });

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    ban: 3,
    allowList: (request) =>
      request.url === '/api/v1/health' || request.url === '/api/v1/health/',
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: {
        code: 'route_not_found',
        message: 'Ruta no encontrada',
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    const databaseError = error as PostgresError;
    if (databaseError.code === '23505') {
      return reply.code(409).send({
        error: {
          code: 'conflict',
          message: 'El recurso ya existe',
        },
      });
    }
    if (databaseError.code === '23503' || databaseError.code === '23514') {
      return reply.code(400).send({
        error: {
          code: 'invalid_data',
          message: 'Los datos no cumplen las reglas del sistema',
        },
      });
    }

    const statusCode =
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error({ error }, 'Unhandled request error');
    }
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 429 ? 'rate_limit_exceeded' : 'internal_error',
        message:
          statusCode === 429
            ? 'Demasiadas solicitudes; inténtalo nuevamente más tarde'
            : statusCode < 500
              ? error instanceof Error
                ? error.message
                : 'Solicitud inválida'
              : 'Ocurrió un error interno',
      },
    });
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(catalogRoutes);
      await api.register(settingsRoutes);
      await api.register(authRoutes);
      await api.register(cartRoutes);
      await api.register(orderRoutes);
      await api.register(quoteRoutes);
      await api.register(adminRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
