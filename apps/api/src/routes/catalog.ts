import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import {
  pagination,
  paginationMeta,
} from '../domain/pagination.js';
import { parse } from '../validation.js';

interface ProductRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  brand: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  saleMode: 'quote_only' | 'direct';
  isFeatured: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  category: Record<string, unknown> | null;
  images: Array<Record<string, unknown>>;
  availableQuantity: number;
}

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const productsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  inStock: booleanQuery.optional(),
  featured: booleanQuery.optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  sort: z
    .enum(['featured', 'newest', 'price_asc', 'price_desc', 'name'])
    .default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const productSelect = `
  SELECT
    p.id,
    p.sku,
    p.slug,
    p.name,
    p.description,
    p.short_description AS "shortDescription",
    p.brand,
    p.price_cents AS "priceCents",
    p.compare_at_price_cents AS "compareAtPriceCents",
    p.currency,
    p.sale_mode AS "saleMode",
    p.is_featured AS "isFeatured",
    p.metadata,
    p.created_at AS "createdAt",
    p.updated_at AS "updatedAt",
    CASE
      WHEN c.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
    END AS category,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pi.id,
          'url', pi.url,
          'altText', pi.alt_text,
          'sortOrder', pi.sort_order,
          'isPrimary', pi.is_primary
        )
        ORDER BY pi.sort_order
      )
      FROM product_images pi
      WHERE pi.product_id = p.id
    ), '[]'::jsonb) AS images,
    GREATEST(COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0), 0)::int
      AS "availableQuantity"
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.product_id = p.id
`;

function serializeProduct(row: ProductRow) {
  return {
    ...row,
    price: row.priceCents / 100,
    compareAtPrice:
      row.compareAtPriceCents === null ? null : row.compareAtPriceCents / 100,
    inStock: row.availableQuantity > 0,
  };
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/products', async (request) => {
    const query = parse(productsQuerySchema, request.query);
    const paging = pagination(query.page, query.limit);
    const values: unknown[] = [];
    const conditions = ['p.is_active = true', '(c.id IS NULL OR c.is_active = true)'];

    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.q) {
      const ref = add(`%${query.q}%`);
      conditions.push(
        `(p.name ILIKE ${ref} OR p.sku ILIKE ${ref} OR COALESCE(p.brand, '') ILIKE ${ref} OR p.description ILIKE ${ref})`,
      );
    }
    if (query.category) {
      const ref = add(query.category);
      conditions.push(`(c.slug = ${ref} OR c.id::text = ${ref})`);
    }
    if (query.brand) {
      const ref = add(query.brand);
      conditions.push(`lower(p.brand) = lower(${ref})`);
    }
    if (query.inStock !== undefined) {
      conditions.push(
        query.inStock
          ? 'COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0) > 0'
          : 'COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0) <= 0',
      );
    }
    if (query.featured !== undefined) {
      const ref = add(query.featured);
      conditions.push(`p.is_featured = ${ref}`);
    }
    if (query.minPriceCents !== undefined) {
      const ref = add(query.minPriceCents);
      conditions.push(`p.price_cents >= ${ref}`);
    }
    if (query.maxPriceCents !== undefined) {
      const ref = add(query.maxPriceCents);
      conditions.push(`p.price_cents <= ${ref}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortSql = {
      featured: 'p.is_featured DESC, p.created_at DESC',
      newest: 'p.created_at DESC',
      price_asc: 'p.price_cents ASC, p.name ASC',
      price_desc: 'p.price_cents DESC, p.name ASC',
      name: 'p.name ASC',
    }[query.sort];

    const countResult = await pool.query<{ total: string }>(
      `
        SELECT count(*)::text AS total
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN inventory i ON i.product_id = p.id
        ${where}
      `,
      values,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const limitRef = add(paging.limit);
    const offsetRef = add(paging.offset);
    const products = await pool.query<ProductRow>(
      `
        ${productSelect}
        ${where}
        ORDER BY ${sortSql}
        LIMIT ${limitRef} OFFSET ${offsetRef}
      `,
      values,
    );

    return {
      data: products.rows.map(serializeProduct),
      meta: paginationMeta(total, paging.page, paging.limit),
    };
  });

  app.get('/products/:identifier', async (request) => {
    const { identifier } = parse(
      z.object({ identifier: z.string().trim().min(1).max(160) }),
      request.params,
    );
    const result = await pool.query<ProductRow>(
      `
        ${productSelect}
        WHERE p.is_active = true
          AND (p.slug = $1 OR p.id::text = $1 OR p.sku = $1)
        LIMIT 1
      `,
      [identifier],
    );
    if (!result.rows[0]) throw notFound('Producto no encontrado');
    return { data: serializeProduct(result.rows[0]) };
  });

  app.get('/categories', async () => {
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.slug,
          c.description,
          c.image_url AS "imageUrl",
          c.sort_order AS "sortOrder",
          count(p.id)::int AS "productCount"
        FROM categories c
        LEFT JOIN products p
          ON p.category_id = c.id AND p.is_active = true
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.sort_order, c.name
      `,
    );
    return { data: result.rows };
  });
}
