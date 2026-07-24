import { createHash, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg, { type PoolClient } from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

type JsonRecord = Record<string, unknown>;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
const catalogPath =
  process.env.CATALOG_PATH || resolve(repositoryRoot, 'data/catalog.json');

const ssl =
  process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined;

const pool = new Pool({ connectionString: databaseUrl, ssl, max: 2 });

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/,(?=\d{1,2}$)/, '.')
    .replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cents(product: JsonRecord): number {
  const nestedPrice = record(product.price);
  const explicitCents = numberValue(
    product.priceCents ??
      product.price_cents ??
      product.amountCents ??
      nestedPrice.minorAmount ??
      nestedPrice.minor_amount,
  );
  if (explicitCents !== undefined) return Math.max(0, Math.round(explicitCents));

  const amount = numberValue(
    (typeof product.price === 'object' ? undefined : product.price) ??
      product.salePrice ??
      product.sale_price ??
      product.currentPrice ??
      product.regularPrice ??
      product.regular_price ??
      nestedPrice.amount ??
      nestedPrice.saleAmount ??
      nestedPrice.regularAmount,
  );
  return Math.max(0, Math.round((amount ?? 0) * 100));
}

function optionalCents(...values: unknown[]): number | null {
  const value = numberValue(values.find((candidate) => candidate !== undefined));
  return value === undefined ? null : Math.max(0, Math.round(value * 100));
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function productArray(parsed: unknown): JsonRecord[] {
  if (Array.isArray(parsed)) return parsed.map(record);
  const root = record(parsed);
  for (const key of ['products', 'items', 'catalog', 'data']) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(record);
    const nested = record(value);
    if (Array.isArray(nested.products)) return nested.products.map(record);
    if (Array.isArray(nested.items)) return nested.items.map(record);
  }
  return [];
}

function categoryName(product: JsonRecord): string {
  const direct = text(
    product.categoryName,
    product.category_name,
    product.category,
  );
  if (direct) return direct;

  const category = record(product.category);
  const nested = text(category.name, category.title, category.slug);
  if (nested) return nested;

  const categories = product.categories;
  if (Array.isArray(categories) && categories.length) {
    const first = categories[0];
    return text(first, record(first).name, record(first).title) ?? 'Sin categoría';
  }
  return 'Sin categoría';
}

function imageUrls(product: JsonRecord): Array<{ url: string; alt?: string }> {
  const raw = product.images ?? product.gallery ?? product.imageUrls;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const fallback = product.image ?? product.imageUrl ?? product.image_url;
  if (!values.length && fallback) values.push(fallback);

  const seen = new Set<string>();
  const result: Array<{ url: string; alt?: string }> = [];
  for (const value of values) {
    const image = record(value);
    const url = text(
      value,
      image.localPath,
      image.local_path,
      image.url,
      image.src,
      image.originalUrl,
      image.original_url,
      image.source,
    );
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ url, alt: text(image.alt, image.altText, image.title) });
  }
  return result.slice(0, 20);
}

function stockQuantity(product: JsonRecord): number {
  const inventory = record(product.inventory);
  const stock = record(product.stock);
  const quantity = numberValue(
    product.stockQuantity ??
      product.stock_quantity ??
      (typeof product.stock === 'object' ? undefined : product.stock) ??
      product.quantity ??
      inventory.quantity ??
      inventory.stock ??
      stock.quantity,
  );
  if (quantity !== undefined) return Math.max(0, Math.floor(quantity));
  return product.inStock === true ||
    product.in_stock === true ||
    stock.inStock === true ||
    stock.in_stock === true
    ? 1
    : 0;
}

function saleMode(product: JsonRecord): 'quote_only' | 'direct' {
  const requested = text(product.saleMode, product.sale_mode);
  return requested === 'direct' && cents(product) > 0 ? 'direct' : 'quote_only';
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await new Promise<Buffer>((resolvePromise, reject) => {
    nodeScrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolvePromise(key)),
    );
  });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function upsertCategory(
  client: PoolClient,
  name: string,
): Promise<string> {
  const slug = slugify(name) || 'sin-categoria';
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO categories (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, is_active = true, updated_at = now()
      RETURNING id
    `,
    [name, slug],
  );
  return result.rows[0]!.id;
}

async function upsertProduct(
  client: PoolClient,
  product: JsonRecord,
  position: number,
): Promise<void> {
  const name = text(product.name, product.title) ?? `Producto ${position + 1}`;
  const sourceSlug = text(product.slug);
  const slug = slugify(sourceSlug ?? name) || `producto-${position + 1}`;
  const sku =
    text(product.sku, product.code, product.codigo)?.toUpperCase() ??
    `RS-${createHash('sha1').update(slug).digest('hex').slice(0, 10).toUpperCase()}`;
  const categoryId = await upsertCategory(client, categoryName(product));
  const metadata = {
    ...record(product.metadata),
    sourceId: text(product.id, product.sourceId, product.externalId),
  };
  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM products
      WHERE slug = $1 OR sku = $2
      ORDER BY CASE WHEN slug = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [slug, sku],
  );

  let productId: string;
  const params = [
    categoryId,
    sku,
    slug,
    name,
    text(product.description, product.content) ?? '',
    text(product.shortDescription, product.short_description, product.summary),
    text(
      product.brand,
      record(product.manufacturer).name,
      record(product.category).name,
    ),
    cents(product),
    optionalCents(
      product.compareAtPrice,
      product.compare_at_price,
      product.regularPrice,
      product.regular_price,
      record(product.price).regularAmount,
    ),
    (
      text(product.currency, record(product.price).currencyCode) ?? 'PEN'
    )
      .toUpperCase()
      .slice(0, 3),
    bool(product.isActive ?? product.active, true),
    bool(product.isFeatured ?? product.featured, false),
    saleMode(product),
    JSON.stringify(metadata),
  ];

  if (existing.rowCount) {
    productId = existing.rows[0]!.id;
    await client.query(
      `
        UPDATE products SET
          category_id = $1,
          sku = $2,
          slug = $3,
          name = $4,
          description = $5,
          short_description = $6,
          brand = $7,
          price_cents = $8,
          compare_at_price_cents = $9,
          currency = $10,
          is_active = $11,
          is_featured = $12,
          sale_mode = $13,
          metadata = $14::jsonb,
          updated_at = now()
        WHERE id = $15
      `,
      [...params, productId],
    );
  } else {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO products (
          category_id, sku, slug, name, description, short_description,
          brand, price_cents, compare_at_price_cents, currency, is_active,
          is_featured, sale_mode, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
        )
        RETURNING id
      `,
      params,
    );
    productId = inserted.rows[0]!.id;
  }

  await client.query(
    `
      INSERT INTO inventory (product_id, quantity)
      VALUES ($1, $2)
      ON CONFLICT (product_id) DO UPDATE
        SET quantity = EXCLUDED.quantity,
            reserved_quantity = LEAST(inventory.reserved_quantity, EXCLUDED.quantity),
            updated_at = now()
    `,
    [productId, stockQuantity(product)],
  );

  await client.query('DELETE FROM product_images WHERE product_id = $1', [
    productId,
  ]);
  const images = imageUrls(product);
  for (const [imageIndex, image] of images.entries()) {
    await client.query(
      `
        INSERT INTO product_images (
          product_id, url, alt_text, sort_order, is_primary
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [productId, image.url, image.alt ?? name, imageIndex, imageIndex === 0],
    );
  }
}

async function seedCatalog(client: PoolClient): Promise<number> {
  try {
    await access(catalogPath, constants.R_OK);
  } catch {
    console.log(`catalog not found at ${catalogPath}; skipping catalog seed`);
    return 0;
  }

  const parsed = JSON.parse(await readFile(catalogPath, 'utf8')) as unknown;
  const products = productArray(parsed);
  for (const [index, product] of products.entries()) {
    await upsertProduct(client, product, index);
  }
  console.log(`seeded ${products.length} catalog products`);
  return products.length;
}

async function seedAdmin(client: PoolClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const firstName = process.env.SEED_ADMIN_FIRST_NAME?.trim();
  const lastName = process.env.SEED_ADMIN_LAST_NAME?.trim();
  const provided = [email, password, firstName, lastName].filter(Boolean).length;

  if (provided === 0) return;
  if (provided !== 4) {
    throw new Error(
      'Provide all SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_FIRST_NAME and SEED_ADMIN_LAST_NAME values',
    );
  }
  if (password!.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must contain at least 12 characters');
  }

  const passwordHash = await hashPassword(password!);
  await client.query(
    `
      INSERT INTO users (
        email, password_hash, first_name, last_name, role, is_active
      )
      VALUES ($1, $2, $3, $4, 'admin', true)
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            role = 'admin',
            is_active = true,
            updated_at = now()
    `,
    [email, passwordHash, firstName, lastName],
  );
  console.log(`seeded admin ${email}`);
}

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedCatalog(client);
    await seedAdmin(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
