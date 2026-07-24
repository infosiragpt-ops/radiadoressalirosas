import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import {
  pagination,
  paginationMeta,
} from '../domain/pagination.js';
import { orderStatuses } from '../domain/order-status.js';
import { notFound } from '../errors.js';
import { currentUser } from '../security/session.js';
import { parse, uuidSchema } from '../validation.js';

const ordersQuerySchema = z.object({
  status: z.enum(orderStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const orderSelect = `
  SELECT
    o.id,
    o.order_number AS "orderNumber",
    o.status,
    o.currency,
    o.subtotal_cents AS "subtotalCents",
    o.shipping_cents AS "shippingCents",
    o.tax_cents AS "taxCents",
    o.total_cents AS "totalCents",
    o.shipping_address AS "shippingAddress",
    o.notes,
    o.shipped_at AS "shippedAt",
    o.delivered_at AS "deliveredAt",
    o.created_at AS "createdAt",
    o.updated_at AS "updatedAt",
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'productId', oi.product_id,
          'sku', oi.sku,
          'productName', oi.product_name,
          'unitPriceCents', oi.unit_price_cents,
          'quantity', oi.quantity,
          'lineTotalCents', oi.line_total_cents,
          'metadata', oi.metadata
        )
        ORDER BY oi.created_at
      )
      FROM order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS items
  FROM orders o
`;

function serializeOrder(row: Record<string, unknown>) {
  const subtotal = Number(row.subtotalCents);
  const shipping = Number(row.shippingCents);
  const tax = Number(row.taxCents);
  const total = Number(row.totalCents);
  return {
    ...row,
    subtotal: subtotal / 100,
    shipping: shipping / 100,
    tax: tax / 100,
    total: total / 100,
  };
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/orders', async (request) => {
    const user = await currentUser(request);
    const query = parse(ordersQuerySchema, request.query);
    const paging = pagination(query.page, query.limit);
    const values: unknown[] = [user!.id];
    const conditions = ['o.user_id = $1'];
    if (query.status) {
      values.push(query.status);
      conditions.push(`o.status = $${values.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const count = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM orders o ${where}`,
      values,
    );
    values.push(paging.limit, paging.offset);
    const result = await pool.query<Record<string, unknown>>(
      `
        ${orderSelect}
        ${where}
        ORDER BY o.created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );
    return {
      data: result.rows.map(serializeOrder),
      meta: paginationMeta(
        Number(count.rows[0]?.total ?? 0),
        paging.page,
        paging.limit,
      ),
    };
  });

  app.get('/orders/:orderId', async (request) => {
    const user = await currentUser(request);
    const { orderId } = parse(
      z.object({ orderId: uuidSchema }),
      request.params,
    );
    const result = await pool.query<Record<string, unknown>>(
      `
        ${orderSelect}
        WHERE o.id = $1 AND o.user_id = $2
      `,
      [orderId, user!.id],
    );
    if (!result.rows[0]) throw notFound('Pedido no encontrado');
    const history = await pool.query(
      `
        SELECT
          from_status AS "fromStatus",
          to_status AS "toStatus",
          note,
          created_at AS "createdAt"
        FROM order_status_history
        WHERE order_id = $1
        ORDER BY created_at
      `,
      [orderId],
    );
    return {
      data: {
        ...serializeOrder(result.rows[0]),
        statusHistory: history.rows,
      },
    };
  });
}
