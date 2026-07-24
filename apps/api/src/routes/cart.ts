import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, transaction, type Queryable } from '../db.js';
import { calculateSubtotal } from '../domain/money.js';
import { ApiError, notFound } from '../errors.js';
import { currentUser } from '../security/session.js';
import { parse, uuidSchema } from '../validation.js';

interface CartLineRow {
  id: string;
  productId: string;
  slug: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  availableQuantity: number;
  imageUrl: string | null;
}

interface CheckoutLine {
  cartItemId: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  availableQuantity: number;
  isActive: boolean;
  saleMode: 'quote_only' | 'direct';
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingAddress: Record<string, unknown>;
  notes: string | null;
  createdAt: Date;
}

function validatedSubtotal(
  lines: ReadonlyArray<{ unitPriceCents: number; quantity: number }>,
): number {
  try {
    return calculateSubtotal(lines);
  } catch (error) {
    if (error instanceof RangeError && error.message === 'invalid_order_total') {
      throw new ApiError(
        422,
        'invalid_order_total',
        'No se pudo calcular un total de pedido válido',
      );
    }
    throw error;
  }
}

const addItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().min(1).max(99).default(1),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

const shippingAddressSchema = z.object({
  recipientName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(6).max(30),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  district: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20).optional(),
  reference: z.string().trim().max(300).optional(),
});

const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional(),
});

async function ensureCart(db: Queryable, userId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `
      INSERT INTO carts (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) WHERE status = 'active'
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [userId],
  );
  return result.rows[0]!.id;
}

async function cartResponse(
  db: Queryable,
  userId: string,
): Promise<Record<string, unknown>> {
  const cartId = await ensureCart(db, userId);
  const result = await db.query<CartLineRow>(
    `
      SELECT
        ci.id,
        p.id AS "productId",
        p.slug,
        p.sku,
        p.name,
        ci.quantity,
        p.price_cents AS "unitPriceCents",
        GREATEST(COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0), 0)::int
          AS "availableQuantity",
        (
          SELECT pi.url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.is_primary DESC, pi.sort_order
          LIMIT 1
        ) AS "imageUrl"
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at
    `,
    [cartId],
  );
  const subtotalCents = validatedSubtotal(
    result.rows.map((line) => ({
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
    })),
  );
  return {
    id: cartId,
    items: result.rows.map((line) => ({
      ...line,
      unitPrice: line.unitPriceCents / 100,
      lineTotalCents: line.unitPriceCents * line.quantity,
      lineTotal: (line.unitPriceCents * line.quantity) / 100,
      inStock: line.availableQuantity >= line.quantity,
    })),
    itemCount: result.rows.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    subtotal: subtotalCents / 100,
    currency: 'PEN',
  };
}

async function orderSummary(
  db: Queryable,
  orderId: string,
  userId: string,
): Promise<OrderSummary> {
  const result = await db.query<OrderSummary>(
    `
      SELECT
        id,
        order_number AS "orderNumber",
        status,
        currency,
        subtotal_cents AS "subtotalCents",
        shipping_cents AS "shippingCents",
        tax_cents AS "taxCents",
        total_cents AS "totalCents",
        shipping_address AS "shippingAddress",
        notes,
        created_at AS "createdAt"
      FROM orders
      WHERE id = $1 AND user_id = $2
    `,
    [orderId, userId],
  );
  return result.rows[0]!;
}

function standardIdempotencyKey(
  request: FastifyRequest,
  bodyKey?: string,
): string | null {
  const header = request.headers['idempotency-key'];
  const value = (Array.isArray(header) ? header[0] : header) ?? bodyKey;
  if (!value) return null;
  const parsed = z
    .string()
    .trim()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key no tiene un formato válido',
    );
  }
  return parsed.data;
}

async function checkout(
  client: PoolClient,
  userId: string,
  address: Record<string, unknown>,
  notes: string | null,
  idempotencyKey: string | null,
): Promise<{ orderId: string; reused: boolean }> {
  if (idempotencyKey) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${userId}:${idempotencyKey}`,
    ]);
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM orders WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    if (existing.rows[0]) {
      return { orderId: existing.rows[0].id, reused: true };
    }
  }

  const cartResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM carts
      WHERE user_id = $1 AND status = 'active'
      FOR UPDATE
    `,
    [userId],
  );
  const cart = cartResult.rows[0];
  if (!cart) {
    throw new ApiError(422, 'empty_cart', 'El carrito está vacío');
  }

  const linesResult = await client.query<CheckoutLine>(
    `
      SELECT
        ci.id AS "cartItemId",
        p.id AS "productId",
        p.sku,
        p.name,
        ci.quantity,
        p.price_cents AS "unitPriceCents",
        GREATEST(i.quantity - i.reserved_quantity, 0)::int AS "availableQuantity",
        p.is_active AS "isActive",
        p.sale_mode AS "saleMode"
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      JOIN inventory i ON i.product_id = p.id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at
      FOR UPDATE OF ci, i
    `,
    [cart.id],
  );
  const lines = linesResult.rows;
  if (!lines.length) {
    throw new ApiError(422, 'empty_cart', 'El carrito está vacío');
  }

  for (const line of lines) {
    if (!line.isActive) {
      throw new ApiError(
        409,
        'product_unavailable',
        `${line.name} ya no está disponible`,
      );
    }
    if (line.saleMode !== 'direct' || line.unitPriceCents <= 0) {
      throw new ApiError(
        409,
        'quote_required',
        `${line.name} requiere una cotización`,
        { productId: line.productId },
      );
    }
    if (line.availableQuantity < line.quantity) {
      throw new ApiError(
        409,
        'insufficient_stock',
        `Stock insuficiente para ${line.name}`,
        {
          productId: line.productId,
          requested: line.quantity,
          available: line.availableQuantity,
        },
      );
    }
  }

  const subtotalCents = validatedSubtotal(lines);
  const totalCents = subtotalCents + config.SHIPPING_FEE_CENTS;
  const sequence = await client.query<{ value: string }>(
    `SELECT nextval('order_number_seq')::text AS value`,
  );
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const orderNumber = `RSR-${date}-${sequence.rows[0]!.value.padStart(6, '0')}`;
  const orderResult = await client.query<{ id: string }>(
    `
      INSERT INTO orders (
        order_number, user_id, currency, subtotal_cents, shipping_cents,
        tax_cents, total_cents, shipping_address, notes, idempotency_key
      )
      VALUES ($1, $2, 'PEN', $3, $4, 0, $5, $6::jsonb, $7, $8)
      RETURNING id
    `,
    [
      orderNumber,
      userId,
      subtotalCents,
      config.SHIPPING_FEE_CENTS,
      totalCents,
      JSON.stringify(address),
      notes,
      idempotencyKey,
    ],
  );
  const orderId = orderResult.rows[0]!.id;

  for (const line of lines) {
    const lineTotalCents = line.unitPriceCents * line.quantity;
    await client.query(
      `
        INSERT INTO order_items (
          order_id, product_id, sku, product_name,
          unit_price_cents, quantity, line_total_cents
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        orderId,
        line.productId,
        line.sku,
        line.name,
        line.unitPriceCents,
        line.quantity,
        lineTotalCents,
      ],
    );
    const inventoryUpdate = await client.query(
      `
        UPDATE inventory
        SET quantity = quantity - $2, updated_at = now()
        WHERE product_id = $1
          AND quantity - reserved_quantity >= $2
      `,
      [line.productId, line.quantity],
    );
    if (inventoryUpdate.rowCount !== 1) {
      throw new ApiError(
        409,
        'insufficient_stock',
        `El stock de ${line.name} cambió durante la compra`,
      );
    }
  }

  await client.query(
    `
      INSERT INTO order_status_history (
        order_id, from_status, to_status, changed_by, note
      )
      VALUES ($1, NULL, 'pending', $2, 'Pedido creado')
    `,
    [orderId, userId],
  );
  await client.query(
    `
      UPDATE carts
      SET status = 'converted', updated_at = now()
      WHERE id = $1
    `,
    [cart.id],
  );
  return { orderId, reused: false };
}

export async function cartRoutes(app: FastifyInstance): Promise<void> {
  app.get('/cart', async (request) => {
    const user = await currentUser(request);
    return { data: await cartResponse(pool, user!.id) };
  });

  app.post('/cart/items', async (request, reply) => {
    const user = await currentUser(request);
    const body = parse(addItemSchema, request.body);
    await transaction(async (client) => {
      const cartId = await ensureCart(client, user!.id);
      const product = await client.query<{
        name: string;
        availableQuantity: number;
        saleMode: 'quote_only' | 'direct';
        priceCents: number;
      }>(
        `
          SELECT
            p.name,
            p.sale_mode AS "saleMode",
            p.price_cents AS "priceCents",
            GREATEST(COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0), 0)::int
              AS "availableQuantity"
          FROM products p
          LEFT JOIN inventory i ON i.product_id = p.id
          WHERE p.id = $1
            AND p.is_active = true
          FOR SHARE OF p
        `,
        [body.productId],
      );
      if (!product.rows[0]) throw notFound('Producto no encontrado');
      if (
        product.rows[0].saleMode !== 'direct' ||
        product.rows[0].priceCents <= 0
      ) {
        throw new ApiError(
          409,
          'quote_required',
          'Este producto se vende mediante cotización',
          { productId: body.productId },
        );
      }

      const existing = await client.query<{ quantity: number }>(
        `
          SELECT quantity
          FROM cart_items
          WHERE cart_id = $1 AND product_id = $2
          FOR UPDATE
        `,
        [cartId, body.productId],
      );
      const nextQuantity = (existing.rows[0]?.quantity ?? 0) + body.quantity;
      if (nextQuantity > 99 || nextQuantity > product.rows[0].availableQuantity) {
        throw new ApiError(
          409,
          'insufficient_stock',
          `Solo hay ${product.rows[0].availableQuantity} unidades disponibles`,
        );
      }
      await client.query(
        `
          INSERT INTO cart_items (cart_id, product_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (cart_id, product_id) DO UPDATE
            SET quantity = EXCLUDED.quantity, updated_at = now()
        `,
        [cartId, body.productId, nextQuantity],
      );
    });
    return reply
      .code(201)
      .send({ data: await cartResponse(pool, user!.id) });
  });

  app.patch('/cart/items/:itemId', async (request) => {
    const user = await currentUser(request);
    const { itemId } = parse(
      z.object({ itemId: uuidSchema }),
      request.params,
    );
    const body = parse(updateItemSchema, request.body);
    const updated = await pool.query(
      `
        UPDATE cart_items ci
        SET quantity = $3, updated_at = now()
        FROM carts c, inventory i
        WHERE ci.id = $1
          AND c.id = ci.cart_id
          AND c.user_id = $2
          AND c.status = 'active'
          AND i.product_id = ci.product_id
          AND i.quantity - i.reserved_quantity >= $3
      `,
      [itemId, user!.id, body.quantity],
    );
    if (updated.rowCount !== 1) {
      throw new ApiError(
        409,
        'cart_item_not_updated',
        'El producto no existe en el carrito o no tiene stock suficiente',
      );
    }
    return { data: await cartResponse(pool, user!.id) };
  });

  app.delete('/cart/items/:itemId', async (request, reply) => {
    const user = await currentUser(request);
    const { itemId } = parse(
      z.object({ itemId: uuidSchema }),
      request.params,
    );
    const deleted = await pool.query(
      `
        DELETE FROM cart_items ci
        USING carts c
        WHERE ci.id = $1
          AND c.id = ci.cart_id
          AND c.user_id = $2
          AND c.status = 'active'
      `,
      [itemId, user!.id],
    );
    if (deleted.rowCount !== 1) throw notFound('Producto no encontrado en el carrito');
    return reply.code(204).send();
  });

  app.delete('/cart/items', async (request, reply) => {
    const user = await currentUser(request);
    await pool.query(
      `
        DELETE FROM cart_items ci
        USING carts c
        WHERE c.id = ci.cart_id
          AND c.user_id = $1
          AND c.status = 'active'
      `,
      [user!.id],
    );
    return reply.code(204).send();
  });

  app.post(
    '/checkout',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = await currentUser(request);
      const body = parse(checkoutSchema, request.body);
      const idempotencyKey = standardIdempotencyKey(
        request,
        body.idempotencyKey,
      );
      const result = await transaction((client) =>
        checkout(
          client,
          user!.id,
          body.shippingAddress,
          body.notes ?? null,
          idempotencyKey,
        ),
      );
      const order = await orderSummary(pool, result.orderId, user!.id);
      return reply.code(result.reused ? 200 : 201).send({
        data: {
          ...order,
          subtotal: order.subtotalCents / 100,
          shipping: order.shippingCents / 100,
          tax: order.taxCents / 100,
          total: order.totalCents / 100,
        },
        meta: { idempotentReplay: result.reused },
      });
    },
  );
}
