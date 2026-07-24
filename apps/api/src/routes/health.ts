import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const startedAt = process.hrtime.bigint();
    try {
      await pool.query('SELECT 1');
      const databaseLatencyMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        status: 'ok',
        service: 'radiadores-api',
        database: {
          status: 'ok',
          latencyMs: Math.round(databaseLatencyMs * 100) / 100,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      requestLogError(app, error);
      return reply.code(503).send({
        status: 'unavailable',
        service: 'radiadores-api',
        database: { status: 'unavailable' },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

function requestLogError(app: FastifyInstance, error: unknown): void {
  app.log.error({ error }, 'Database health check failed');
}
