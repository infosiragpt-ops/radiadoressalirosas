import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { writeAuditLog } from '../audit.js';
import { pool, transaction } from '../db.js';
import {
  canTransitionOrder,
  orderStatuses,
  type OrderStatus,
} from '../domain/order-status.js';
import {
  pagination,
  paginationMeta,
} from '../domain/pagination.js';
import { ApiError, notFound } from '../errors.js';
import {
  requireAdmin,
  requireStaff,
  type AuthUser,
} from '../security/session.js';
import { parse, uuidSchema } from '../validation.js';

const imageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith('/') || URL.canParse(value),
    'Debe ser una URL absoluta o una ruta que empiece con /',
  );

const imageSchema = z.object({
  url: imageUrlSchema,
  altText: z.string().trim().max(300).optional(),
});

const productFields = {
  categoryId: uuidSchema.nullable().optional(),
  sku: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20_000),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  priceCents: z.number().int().min(0).max(2_000_000_000),
  compareAtPriceCents: z.number().int().min(0).nullable().optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  saleMode: z.enum(['quote_only', 'direct']),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  metadata: z.record(z.unknown()),
  inventoryQuantity: z.number().int().min(0).max(2_000_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  images: z.array(imageSchema).max(30),
};

const createProductSchema = z
  .object({
    categoryId: productFields.categoryId,
    sku: productFields.sku,
    slug: productFields.slug,
    name: productFields.name,
    description: productFields.description.default(''),
    shortDescription: productFields.shortDescription,
    brand: productFields.brand,
    priceCents: productFields.priceCents.default(0),
    compareAtPriceCents: productFields.compareAtPriceCents,
    currency: productFields.currency.default('PEN'),
    saleMode: productFields.saleMode.default('quote_only'),
    isActive: productFields.isActive.default(true),
    isFeatured: productFields.isFeatured.default(false),
    metadata: productFields.metadata.default({}),
    inventoryQuantity: productFields.inventoryQuantity.default(0),
    lowStockThreshold: productFields.lowStockThreshold.default(5),
    images: productFields.images.default([]),
  })
  .superRefine((value, context) => {
    if (value.saleMode === 'direct' && value.priceCents <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceCents'],
        message: 'Una venta directa requiere un precio mayor que cero',
      });
    }
  });

const updateProductSchema = z.object({
  categoryId: productFields.categoryId,
  sku: productFields.sku.optional(),
  slug: productFields.slug.optional(),
  name: productFields.name.optional(),
  description: productFields.description.optional(),
  shortDescription: productFields.shortDescription,
  brand: productFields.brand,
  priceCents: productFields.priceCents.optional(),
  compareAtPriceCents: productFields.compareAtPriceCents,
  currency: productFields.currency.optional(),
  saleMode: productFields.saleMode.optional(),
  isActive: productFields.isActive.optional(),
  isFeatured: productFields.isFeatured.optional(),
  metadata: productFields.metadata.optional(),
  inventoryQuantity: productFields.inventoryQuantity.optional(),
  lowStockThreshold: productFields.lowStockThreshold.optional(),
  images: productFields.images.optional(),
});

const adminProductsQuery = z.object({
  q: z.string().trim().max(120).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  saleMode: z.enum(['quote_only', 'direct']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const adminOrdersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(orderStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const updateOrderSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(1000).optional(),
});

const quoteStatuses = ['new', 'contacted', 'quoted', 'won', 'closed'] as const;
const adminQuotesQuery = z.object({
  status: z.enum(quoteStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const updateQuoteSchema = z.object({
  status: z.enum(quoteStatuses),
  assignedTo: uuidSchema.nullable().optional(),
});

function constraintError(error: unknown): never {
  if (typeof error === 'object' && error && 'code' in error) {
    if (error.code === '23505') {
      throw new ApiError(
        409,
        'duplicate_product_identifier',
        'El SKU o slug ya pertenece a otro producto',
      );
    }
    if (error.code === '23503') {
      throw new ApiError(
        400,
        'invalid_reference',
        'La categoría o usuario relacionado no existe',
      );
    }
  }
  throw error;
}

async function insertImages(
  client: PoolClient,
  productId: string,
  images: Array<{ url: string; altText?: string | undefined }>,
): Promise<void> {
  for (const [index, image] of images.entries()) {
    await client.query(
      `
        INSERT INTO product_images (
          product_id, url, alt_text, sort_order, is_primary
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [productId, image.url, image.altText ?? null, index, index === 0],
    );
  }
}

async function createProduct(
  client: PoolClient,
  request: FastifyRequest,
  actor: AuthUser,
  body: z.infer<typeof createProductSchema>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO products (
        category_id, sku, slug, name, description, short_description,
        brand, price_cents, compare_at_price_cents, currency, sale_mode,
        is_active, is_featured, metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      RETURNING id
    `,
    [
      body.categoryId ?? null,
      body.sku,
      body.slug,
      body.name,
      body.description,
      body.shortDescription ?? null,
      body.brand ?? null,
      body.priceCents,
      body.compareAtPriceCents ?? null,
      body.currency,
      body.saleMode,
      body.isActive,
      body.isFeatured,
      JSON.stringify(body.metadata),
    ],
  );
  const productId = result.rows[0]!.id;
  await client.query(
    `
      INSERT INTO inventory (
        product_id, quantity, low_stock_threshold
      )
      VALUES ($1, $2, $3)
    `,
    [productId, body.inventoryQuantity, body.lowStockThreshold],
  );
  await insertImages(client, productId, body.images);
  await writeAuditLog(
    client,
    request,
    actor,
    'product.create',
    'product',
    productId,
  );
  return productId;
}

async function updateProduct(
  client: PoolClient,
  request: FastifyRequest,
  actor: AuthUser,
  productId: string,
  body: z.infer<typeof updateProductSchema>,
): Promise<void> {
  const existing = await client.query<{
    priceCents: number;
    saleMode: 'quote_only' | 'direct';
  }>(
    `
      SELECT price_cents AS "priceCents", sale_mode AS "saleMode"
      FROM products
      WHERE id = $1
      FOR UPDATE
    `,
    [productId],
  );
  if (!existing.rows[0]) throw notFound('Producto no encontrado');
  const finalPrice = body.priceCents ?? existing.rows[0].priceCents;
  const finalSaleMode = body.saleMode ?? existing.rows[0].saleMode;
  if (finalSaleMode === 'direct' && finalPrice <= 0) {
    throw new ApiError(
      400,
      'direct_sale_requires_price',
      'Una venta directa requiere un precio mayor que cero',
    );
  }

  const values: unknown[] = [];
  const sets: string[] = [];
  const add = (column: string, value: unknown, cast = ''): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };
  if (body.categoryId !== undefined) add('category_id', body.categoryId);
  if (body.sku !== undefined) add('sku', body.sku);
  if (body.slug !== undefined) add('slug', body.slug);
  if (body.name !== undefined) add('name', body.name);
  if (body.description !== undefined) add('description', body.description);
  if (body.shortDescription !== undefined) {
    add('short_description', body.shortDescription);
  }
  if (body.brand !== undefined) add('brand', body.brand);
  if (body.priceCents !== undefined) add('price_cents', body.priceCents);
  if (body.compareAtPriceCents !== undefined) {
    add('compare_at_price_cents', body.compareAtPriceCents);
  }
  if (body.currency !== undefined) add('currency', body.currency);
  if (body.saleMode !== undefined) add('sale_mode', body.saleMode);
  if (body.isActive !== undefined) add('is_active', body.isActive);
  if (body.isFeatured !== undefined) add('is_featured', body.isFeatured);
  if (body.metadata !== undefined) {
    add('metadata', JSON.stringify(body.metadata), '::jsonb');
  }
  if (sets.length) {
    values.push(productId);
    await client.query(
      `
        UPDATE products
        SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length}
      `,
      values,
    );
  }
  if (
    body.inventoryQuantity !== undefined ||
    body.lowStockThreshold !== undefined
  ) {
    await client.query(
      `
        UPDATE inventory SET
          quantity = COALESCE($2, quantity),
          low_stock_threshold = COALESCE($3, low_stock_threshold),
          reserved_quantity = LEAST(
            reserved_quantity,
            COALESCE($2, quantity)
          ),
          updated_at = now()
        WHERE product_id = $1
      `,
      [
        productId,
        body.inventoryQuantity ?? null,
        body.lowStockThreshold ?? null,
      ],
    );
  }
  if (body.images !== undefined) {
    await client.query('DELETE FROM product_images WHERE product_id = $1', [
      productId,
    ]);
    await insertImages(client, productId, body.images);
  }
  await writeAuditLog(
    client,
    request,
    actor,
    'product.update',
    'product',
    productId,
    { fields: Object.keys(body) },
  );
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/products', async (request) => {
    await requireStaff(request);
    const query = parse(adminProductsQuery, request.query);
    const paging = pagination(query.page, query.limit);
    const values: unknown[] = [];
    const conditions: string[] = [];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.q) {
      const ref = add(`%${query.q}%`);
      conditions.push(`(p.name ILIKE ${ref} OR p.sku ILIKE ${ref})`);
    }
    if (query.active !== undefined) {
      conditions.push(`p.is_active = ${add(query.active)}`);
    }
    if (query.saleMode) {
      conditions.push(`p.sale_mode = ${add(query.saleMode)}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM products p ${where}`,
      values,
    );
    const limit = add(paging.limit);
    const offset = add(paging.offset);
    const result = await pool.query(
      `
        SELECT
          p.id, p.sku, p.slug, p.name, p.brand,
          p.price_cents AS "priceCents",
          p.currency,
          p.sale_mode AS "saleMode",
          p.is_active AS "isActive",
          p.is_featured AS "isFeatured",
          c.name AS "categoryName",
          COALESCE(i.quantity, 0)::int AS "inventoryQuantity",
          COALESCE(i.low_stock_threshold, 0)::int AS "lowStockThreshold",
          p.updated_at AS "updatedAt"
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN inventory i ON i.product_id = p.id
        ${where}
        ORDER BY p.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      values,
    );
    return {
      data: result.rows,
      meta: paginationMeta(
        Number(count.rows[0]?.total ?? 0),
        paging.page,
        paging.limit,
      ),
    };
  });

  app.post('/admin/products', async (request, reply) => {
    const actor = await requireStaff(request);
    const body = parse(createProductSchema, request.body);
    try {
      const productId = await transaction((client) =>
        createProduct(client, request, actor, body),
      );
      return reply.code(201).send({ data: { id: productId } });
    } catch (error) {
      constraintError(error);
    }
  });

  app.patch('/admin/products/:productId', async (request) => {
    const actor = await requireStaff(request);
    const { productId } = parse(
      z.object({ productId: uuidSchema }),
      request.params,
    );
    const body = parse(updateProductSchema, request.body);
    try {
      await transaction((client) =>
        updateProduct(client, request, actor, productId, body),
      );
    } catch (error) {
      constraintError(error);
    }
    return { data: { id: productId, updated: true } };
  });

  app.delete('/admin/products/:productId', async (request, reply) => {
    const actor = await requireStaff(request);
    const { productId } = parse(
      z.object({ productId: uuidSchema }),
      request.params,
    );
    await transaction(async (client) => {
      const result = await client.query(
        `
          UPDATE products
          SET is_active = false, updated_at = now()
          WHERE id = $1
        `,
        [productId],
      );
      if (result.rowCount !== 1) throw notFound('Producto no encontrado');
      await writeAuditLog(
        client,
        request,
        actor,
        'product.archive',
        'product',
        productId,
      );
    });
    return reply.code(204).send();
  });

  app.get('/admin/orders', async (request) => {
    await requireStaff(request);
    const query = parse(adminOrdersQuery, request.query);
    const paging = pagination(query.page, query.limit);
    const values: unknown[] = [];
    const conditions: string[] = [];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.status) conditions.push(`o.status = ${add(query.status)}`);
    if (query.q) {
      const ref = add(`%${query.q}%`);
      conditions.push(
        `(o.order_number ILIKE ${ref} OR u.email ILIKE ${ref} OR concat(u.first_name, ' ', u.last_name) ILIKE ${ref})`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await pool.query<{ total: string }>(
      `
        SELECT count(*)::text AS total
        FROM orders o JOIN users u ON u.id = o.user_id
        ${where}
      `,
      values,
    );
    const limit = add(paging.limit);
    const offset = add(paging.offset);
    const result = await pool.query(
      `
        SELECT
          o.id,
          o.order_number AS "orderNumber",
          o.status,
          o.currency,
          o.total_cents AS "totalCents",
          o.created_at AS "createdAt",
          jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', concat_ws(' ', u.first_name, u.last_name)
          ) AS customer,
          (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id)
            AS "lineCount"
        FROM orders o
        JOIN users u ON u.id = o.user_id
        ${where}
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      values,
    );
    return {
      data: result.rows,
      meta: paginationMeta(
        Number(count.rows[0]?.total ?? 0),
        paging.page,
        paging.limit,
      ),
    };
  });

  app.patch('/admin/orders/:orderId/status', async (request) => {
    const actor = await requireStaff(request);
    const { orderId } = parse(
      z.object({ orderId: uuidSchema }),
      request.params,
    );
    const body = parse(updateOrderSchema, request.body);
    await transaction(async (client) => {
      const result = await client.query<{ status: OrderStatus }>(
        'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const current = result.rows[0]?.status;
      if (!current) throw notFound('Pedido no encontrado');
      if (!canTransitionOrder(current, body.status)) {
        throw new ApiError(
          409,
          'invalid_order_transition',
          `No se puede cambiar un pedido de ${current} a ${body.status}`,
        );
      }
      if (body.status === 'cancelled') {
        await client.query(
          `
            UPDATE inventory i
            SET quantity = i.quantity + source.quantity,
                updated_at = now()
            FROM (
              SELECT product_id, sum(quantity)::int AS quantity
              FROM order_items
              WHERE order_id = $1 AND product_id IS NOT NULL
              GROUP BY product_id
            ) source
            WHERE i.product_id = source.product_id
          `,
          [orderId],
        );
      }
      await client.query(
        `
          UPDATE orders SET
            status = $2,
            shipped_at = CASE WHEN $2 = 'shipped' THEN now() ELSE shipped_at END,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
            updated_at = now()
          WHERE id = $1
        `,
        [orderId, body.status],
      );
      await client.query(
        `
          INSERT INTO order_status_history (
            order_id, from_status, to_status, changed_by, note
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [orderId, current, body.status, actor.id, body.note ?? null],
      );
      await writeAuditLog(
        client,
        request,
        actor,
        'order.status_update',
        'order',
        orderId,
        { from: current, to: body.status },
      );
    });
    return { data: { id: orderId, status: body.status } };
  });

  app.get('/admin/stats', async (request) => {
    await requireStaff(request);
    const result = await pool.query<{
      activeProducts: number;
      directProducts: number;
      quoteOnlyProducts: number;
      lowStockProducts: number;
      openOrders: number;
      newQuotes: number;
      customers: number;
      deliveredRevenueCents: string;
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM products WHERE is_active) AS "activeProducts",
          (SELECT count(*)::int FROM products WHERE is_active AND sale_mode = 'direct') AS "directProducts",
          (SELECT count(*)::int FROM products WHERE is_active AND sale_mode = 'quote_only') AS "quoteOnlyProducts",
          (
            SELECT count(*)::int
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            WHERE p.is_active
              AND p.sale_mode = 'direct'
              AND i.quantity - i.reserved_quantity <= i.low_stock_threshold
          ) AS "lowStockProducts",
          (
            SELECT count(*)::int
            FROM orders
            WHERE status IN ('pending', 'confirmed', 'processing', 'shipped')
          ) AS "openOrders",
          (SELECT count(*)::int FROM quote_requests WHERE status = 'new') AS "newQuotes",
          (SELECT count(*)::int FROM users WHERE role = 'customer') AS customers,
          (
            SELECT COALESCE(sum(total_cents), 0)::text
            FROM orders
            WHERE status = 'delivered'
          ) AS "deliveredRevenueCents"
      `,
    );
    const stats = result.rows[0]!;
    return {
      data: {
        ...stats,
        deliveredRevenueCents: Number(stats.deliveredRevenueCents),
        deliveredRevenue: Number(stats.deliveredRevenueCents) / 100,
      },
    };
  });

  app.get('/admin/quotes', async (request) => {
    await requireStaff(request);
    const query = parse(adminQuotesQuery, request.query);
    const paging = pagination(query.page, query.limit);
    const values: unknown[] = [];
    const where = query.status
      ? `WHERE qr.status = $${values.push(query.status)}`
      : '';
    const count = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM quote_requests qr ${where}`,
      values,
    );
    values.push(paging.limit, paging.offset);
    const result = await pool.query(
      `
        SELECT
          qr.id,
          qr.request_number AS "requestNumber",
          qr.status,
          qr.contact_name AS "contactName",
          qr.contact_email AS "contactEmail",
          qr.contact_phone AS "contactPhone",
          qr.company_name AS "companyName",
          qr.message,
          qr.assigned_to AS "assignedTo",
          qr.created_at AS "createdAt",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'productId', qri.product_id,
                'sku', qri.sku,
                'productName', qri.product_name,
                'quantity', qri.quantity,
                'notes', qri.notes
              )
              ORDER BY qri.created_at
            )
            FROM quote_request_items qri
            WHERE qri.quote_request_id = qr.id
          ), '[]'::jsonb) AS items
        FROM quote_requests qr
        ${where}
        ORDER BY qr.created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );
    return {
      data: result.rows,
      meta: paginationMeta(
        Number(count.rows[0]?.total ?? 0),
        paging.page,
        paging.limit,
      ),
    };
  });

  app.patch('/admin/quotes/:quoteId', async (request) => {
    const actor = await requireStaff(request);
    const { quoteId } = parse(
      z.object({ quoteId: uuidSchema }),
      request.params,
    );
    const body = parse(updateQuoteSchema, request.body);
    try {
      await transaction(async (client) => {
        const result = await client.query(
          `
            UPDATE quote_requests
            SET status = $2,
                assigned_to = CASE
                  WHEN $4::boolean THEN $3::uuid
                  ELSE assigned_to
                END,
                updated_at = now()
            WHERE id = $1
          `,
          [
            quoteId,
            body.status,
            body.assignedTo ?? null,
            body.assignedTo !== undefined,
          ],
        );
        if (result.rowCount !== 1) throw notFound('Cotización no encontrada');
        await writeAuditLog(
          client,
          request,
          actor,
          'quote.update',
          'quote_request',
          quoteId,
          { status: body.status, assignedTo: body.assignedTo },
        );
      });
    } catch (error) {
      constraintError(error);
    }
    return { data: { id: quoteId, status: body.status } };
  });

  app.put('/admin/settings/:key', async (request) => {
    const actor = await requireAdmin(request);
    const { key } = parse(
      z.object({ key: z.string().regex(/^[a-z0-9_]{1,100}$/) }),
      request.params,
    );
    const body = parse(
      z.object({
        value: z.unknown(),
        isPublic: z.boolean().default(false),
        description: z.string().trim().max(500).optional(),
      }),
      request.body,
    );
    await transaction(async (client) => {
      await client.query(
        `
          INSERT INTO site_settings (
            key, value, is_public, description, updated_by
          )
          VALUES ($1, $2::jsonb, $3, $4, $5)
          ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                is_public = EXCLUDED.is_public,
                description = EXCLUDED.description,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
        `,
        [
          key,
          JSON.stringify(body.value),
          body.isPublic,
          body.description ?? null,
          actor.id,
        ],
      );
      await writeAuditLog(
        client,
        request,
        actor,
        'setting.upsert',
        'site_setting',
        key,
      );
    });
    return { data: { key, ...body } };
  });
}
