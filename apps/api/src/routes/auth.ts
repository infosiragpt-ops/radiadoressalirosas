import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { ApiError } from '../errors.js';
import { parse } from '../validation.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import {
  createSession,
  currentUser,
  destroySession,
  type AuthUser,
} from '../security/session.js';

interface UserRow extends AuthUser {
  passwordHash: string;
}

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[a-z]/, 'Debe contener una letra minúscula')
    .regex(/[A-Z]/, 'Debe contener una letra mayúscula')
    .regex(/\d/, 'Debe contener un número'),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

function publicUser(row: AuthUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    role: row.role,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/register',
    {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = parse(registerSchema, request.body);
      const email = body.email.toLowerCase();
      let result;
      try {
        result = await pool.query<AuthUser>(
          `
            INSERT INTO users (
              email, password_hash, first_name, last_name, phone
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
              id,
              email,
              first_name AS "firstName",
              last_name AS "lastName",
              phone,
              role
          `,
          [
            email,
            await hashPassword(body.password),
            body.firstName,
            body.lastName,
            body.phone ?? null,
          ],
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          throw new ApiError(
            409,
            'email_already_registered',
            'Ya existe una cuenta con ese correo',
          );
        }
        throw error;
      }
      const user = result.rows[0]!;
      await createSession(request, reply, user.id);
      return reply.code(201).send({ data: publicUser(user) });
    },
  );

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = parse(loginSchema, request.body);
      const result = await pool.query<UserRow>(
        `
          SELECT
            id,
            email,
            password_hash AS "passwordHash",
            first_name AS "firstName",
            last_name AS "lastName",
            phone,
            role
          FROM users
          WHERE email = $1 AND is_active = true
          LIMIT 1
        `,
        [body.email.toLowerCase()],
      );
      const user = result.rows[0];
      const valid = await verifyPassword(
        body.password,
        user?.passwordHash ?? (await dummyPasswordHash),
      );
      if (!user || !valid) {
        throw new ApiError(
          401,
          'invalid_credentials',
          'Correo o contraseña incorrectos',
        );
      }

      await createSession(request, reply, user.id);
      return { data: publicUser(user) };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request, reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request) => {
    const user = await currentUser(request);
    return { data: publicUser(user!) };
  });
}
