import type { FastifyRequest } from 'fastify';
import type { AuthUser } from './security/session.js';
import type { Queryable } from './db.js';

export async function writeAuditLog(
  db: Queryable,
  request: FastifyRequest,
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `
      INSERT INTO audit_logs (
        actor_user_id, action, entity_type, entity_id,
        ip_address, user_agent, metadata
      )
      VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb)
    `,
    [
      actor.id,
      action,
      entityType,
      entityId,
      request.ip,
      request.headers['user-agent']?.slice(0, 1000) ?? null,
      JSON.stringify(metadata),
    ],
  );
}
