import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { transaction } from '../db.js';
import { ApiError } from '../errors.js';
import { currentUser } from '../security/session.js';
import { parse, uuidSchema } from '../validation.js';

const quoteSchema = z.object({
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().max(254).optional(),
  contactPhone: z.string().trim().min(6).max(30),
  companyName: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().int().min(1).max(999).default(1),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .max(25)
    .default([]),
});

interface QuoteProduct {
  id: string;
  sku: string;
  name: string;
}

export async function quoteRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/quotes',
    {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = parse(quoteSchema, request.body);
      const user = await currentUser(request, false);
      const created = await transaction(async (client) => {
        const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
        const products = await client.query<QuoteProduct>(
          `
            SELECT id, sku, name
            FROM products
            WHERE id = ANY($1::uuid[]) AND is_active = true
          `,
          [uniqueProductIds],
        );
        if (products.rowCount !== uniqueProductIds.length) {
          throw new ApiError(
            400,
            'invalid_quote_products',
            'Uno o más productos no existen o no están disponibles',
          );
        }
        const byId = new Map(products.rows.map((product) => [product.id, product]));
        const sequence = await client.query<{ value: string }>(
          `SELECT nextval('quote_request_number_seq')::text AS value`,
        );
        const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        const requestNumber = `COT-${date}-${sequence.rows[0]!.value.padStart(6, '0')}`;
        const quote = await client.query<{ id: string }>(
          `
            INSERT INTO quote_requests (
              request_number, user_id, contact_name, contact_email,
              contact_phone, company_name, message
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `,
          [
            requestNumber,
            user?.id ?? null,
            body.contactName,
            body.contactEmail?.toLowerCase() ?? null,
            body.contactPhone,
            body.companyName ?? null,
            body.message ?? null,
          ],
        );
        const quoteId = quote.rows[0]!.id;
        for (const item of body.items) {
          const product = byId.get(item.productId)!;
          await client.query(
            `
              INSERT INTO quote_request_items (
                quote_request_id, product_id, sku, product_name, quantity, notes
              )
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              quoteId,
              product.id,
              product.sku,
              product.name,
              item.quantity,
              item.notes ?? null,
            ],
          );
        }
        return { id: quoteId, requestNumber };
      });

      return reply.code(201).send({
        data: {
          ...created,
          status: 'new',
          message: 'Solicitud de cotización recibida',
        },
      });
    },
  );
}
