import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async () => {
    const result = await pool.query<{ key: string; value: unknown }>(
      `
        SELECT key, value
        FROM site_settings
        WHERE is_public = true
        ORDER BY key
      `,
    );
    return {
      data: Object.fromEntries(
        result.rows.map((setting) => [setting.key, setting.value]),
      ),
    };
  });
}
