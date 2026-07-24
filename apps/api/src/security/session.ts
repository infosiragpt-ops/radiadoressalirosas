import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError } from '../errors.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'customer' | 'staff' | 'admin';
}

interface SessionRow {
  sessionId: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'customer' | 'staff' | 'admin';
}

function tokenHash(token: string): string {
  return createHmac('sha256', config.SESSION_SECRET)
    .update(token)
    .digest('hex');
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    signed: true,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  };
}

function rawCookie(request: FastifyRequest): string | null {
  const signed = request.cookies[config.SESSION_COOKIE_NAME];
  if (!signed) return null;
  const unsigned = request.unsignCookie(signed);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

function toUser(row: SessionRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    role: row.role,
  };
}

export async function createSession(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  await pool.query(
    `
      INSERT INTO sessions (
        user_id, token_hash, expires_at, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4::inet, $5)
    `,
    [
      userId,
      tokenHash(token),
      expiresAt,
      request.ip,
      request.headers['user-agent']?.slice(0, 1000) ?? null,
    ],
  );
  reply.setCookie(config.SESSION_COOKIE_NAME, token, cookieOptions());
}

export async function currentUser(
  request: FastifyRequest,
  required = true,
): Promise<AuthUser | null> {
  const token = rawCookie(request);
  if (!token) {
    if (required) {
      throw new ApiError(401, 'authentication_required', 'Inicia sesión para continuar');
    }
    return null;
  }

  const result = await pool.query<SessionRow>(
    `
      SELECT
        s.id AS "sessionId",
        u.id,
        u.email,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.phone,
        u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.is_active = true
      LIMIT 1
    `,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) {
    if (required) {
      throw new ApiError(401, 'invalid_session', 'La sesión expiró o ya no es válida');
    }
    return null;
  }

  void pool
    .query(
      `
        UPDATE sessions
        SET last_seen_at = now()
        WHERE id = $1 AND last_seen_at < now() - interval '15 minutes'
      `,
      [row.sessionId],
    )
    .catch(() => undefined);
  return toUser(row);
}

export async function requireAdmin(
  request: FastifyRequest,
): Promise<AuthUser> {
  const user = await currentUser(request);
  if (user!.role !== 'admin') {
    throw new ApiError(403, 'admin_required', 'No tienes permisos para esta operación');
  }
  return user!;
}

export async function requireStaff(
  request: FastifyRequest,
): Promise<AuthUser> {
  const user = await currentUser(request);
  if (user!.role !== 'admin' && user!.role !== 'staff') {
    throw new ApiError(403, 'staff_required', 'No tienes permisos para esta operación');
  }
  return user!;
}

export async function destroySession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = rawCookie(request);
  if (token) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [
      tokenHash(token),
    ]);
  }
  reply.clearCookie(config.SESSION_COOKIE_NAME, cookieOptions());
}
