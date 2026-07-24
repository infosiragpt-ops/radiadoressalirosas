import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = await buildApp();
let closing = false;

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'Graceful shutdown started');
  const forceExit = setTimeout(() => {
    app.log.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await app.close();
    await pool.end();
    clearTimeout(forceExit);
  } catch (error) {
    app.log.error({ error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await pool.query('SELECT 1');
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ error }, 'API failed to start');
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
}
