const ASSET_ROOT = "/assets/original";

export const FALLBACK_PRODUCTS = [
  {
    id: "man-radiador-tga",
    slug: "radiador-man-tga-26480",
    name: "Radiador MAN TGA 26.480",
    sku: "81061016407",
    brand: "MAN",
    category: "Radiadores",
    categorySlug: "radiadores",
    image: `${ASSET_ROOT}/product-man-radiador.jpg`,
    featured: true,
    isNew: false,
    stock: 4,
  },
  {
    id: "volvo-enfriador-vt",
    slug: "enfriador-caja-vt-motor-volvo-20810985",
    name: "Enfriador caja VT motor Volvo",
    sku: "20810985",
    brand: "Volvo",
    category: "Enfriadores",
    categorySlug: "enfriadores",
    image: `${ASSET_ROOT}/product-volvo-enfriador-vt.jpg`,
    featured: true,
    isNew: true,
    stock: 6,
  },
  {
    id: "volvo-condensador-fh480",
    slug: "condensador-motor-volvo-fh480-22768927",
    name: "Condensador motor Volvo FH480 / 950 × 450 × 150",
    sku: "22768927",
    brand: "Volvo",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-volvo-condensador-fh480.jpg`,
    featured: true,
    isNew: true,
    stock: 8,
  },
  {
    id: "volvo-condensador-fh16",
    slug: "condensador-motor-volvo-480-fh16-82356758",
    name: "Condensador motor Volvo 480-FH16",
    sku: "82356758",
    brand: "Volvo",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-volvo-condensador-fh16.jpg`,
    featured: true,
    isNew: true,
    stock: 5,
  },
  {
    id: "mercedes-condensador-actros",
    slug: "condensador-mercedes-benz-actros-a9425000154",
    name: "Condensador Mercedes-Benz Actros",
    sku: "A9425000154",
    brand: "Mercedes-Benz",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-mercedes-condensador-actros.jpg`,
    featured: true,
    isNew: true,
    stock: 3,
  },
  {
    id: "freightliner-condensador-columbia",
    slug: "condensador-freightliner-columbia-mod1e5864",
    name: "Condensador Freightliner Columbia – Century / 31 3/4” × 3/4” × 20",
    sku: "MOD1E5864",
    brand: "Freightliner",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-freightliner-condensador.jpg`,
    featured: false,
    isNew: true,
    stock: 4,
  },
  {
    id: "scania-condensador-r460",
    slug: "condensador-scania-r460-g440-1921284",
    name: "Condensador Scania R460-G440 / 31 1/4 × 13 1/2 × 3/4",
    sku: "1921284",
    brand: "Scania",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-scania-condensador-r460.jpg`,
    featured: false,
    isNew: true,
    stock: 7,
  },
  {
    id: "international-condensador-workstar",
    slug: "condensador-international-workstar-1e0059390000",
    name: "Condensador de motor International Workstar / 31” × 16 × 3/4”",
    sku: "1E0059390000",
    brand: "International",
    category: "Condensadores",
    categorySlug: "condensadores",
    image: `${ASSET_ROOT}/product-international-condensador.jpg`,
    featured: false,
    isNew: true,
    stock: 5,
  },
  {
    id: "mercedes-carcasa-actros",
    slug: "carcasa-enfriador-mercedes-benz-actros-a5411882704",
    name: "Carcasa de enfriador de motor Mercedes-Benz Actros O500RSDD",
    sku: "A5411882704",
    brand: "Mercedes-Benz",
    category: "Carcasas",
    categorySlug: "carcasas",
    image: `${ASSET_ROOT}/product-mercedes-carcasa-actros.jpg`,
    featured: false,
    isNew: true,
    stock: 2,
  },
  {
    id: "scania-carcasa-r460",
    slug: "carcasa-aluminio-enfriador-scania-r460-2001484",
    name: "Carcasa de aluminio de enfriador motor Scania R460",
    sku: "2001484",
    brand: "Scania",
    category: "Carcasas",
    categorySlug: "carcasas",
    image: `${ASSET_ROOT}/product-scania-carcasa-r460.jpg`,
    featured: false,
    isNew: true,
    stock: 3,
  },
  {
    id: "scania-carcasa-k124",
    slug: "carcasa-aluminio-enfriador-scania-k124-r420",
    name: "Carcasa de aluminio de enfriador motor Scania K124-R420",
    sku: "1795526-1774202",
    brand: "Scania",
    category: "Carcasas",
    categorySlug: "carcasas",
    image: `${ASSET_ROOT}/product-scania-carcasa-k124.jpg`,
    featured: false,
    isNew: true,
    stock: 2,
  },
  {
    id: "volvo-radiador-fh",
    slug: "radiador-volvo-fh-euro-6",
    name: "Radiador Volvo FH Euro 6",
    sku: "22471979",
    brand: "Volvo",
    category: "Radiadores",
    categorySlug: "radiadores",
    image: `${ASSET_ROOT}/product-volvo-radiador-fh.jpg`,
    featured: false,
    isNew: false,
    stock: 5,
  },
];

const slugify = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const asNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeProduct(product, index = 0) {
  const categoryObject =
    typeof product.category === "object" && product.category ? product.category : null;
  const brandObject =
    typeof product.brand === "object" && product.brand ? product.brand : null;
  const name = product.name || product.title || `Repuesto ${index + 1}`;
  const category =
    categoryObject?.name ||
    product.category_name ||
    (typeof product.category === "string" ? product.category : "") ||
    "Radiadores";
  const brand =
    brandObject?.name ||
    product.brand_name ||
    (typeof product.brand === "string" ? product.brand : "") ||
    "Salirosas";
  const images = Array.isArray(product.images) ? product.images : [];
  const imageObject =
    typeof product.image === "object" && product.image ? product.image : null;
  const firstImage =
    images[0]?.url ||
    images[0]?.src ||
    images[0]?.localPath ||
    images[0]?.originalUrl ||
    (typeof images[0] === "string" ? images[0] : "") ||
    product.image_url ||
    product.imageUrl ||
    product.primary_image ||
    product.primaryImage ||
    imageObject?.localPath ||
    imageObject?.url ||
    imageObject?.src ||
    imageObject?.originalUrl ||
    (typeof product.image === "string" ? product.image : "") ||
    "";
  const explicitSaleMode = product.sale_mode || product.saleMode;
  const rawPrice =
    typeof product.price === "object" && product.price
      ? product.price.amount ?? product.price.regularAmount
      : product.price;
  const rawSalePrice =
    typeof product.price === "object" && product.price
      ? product.price.saleAmount
      : product.sale_price ?? product.salePrice;
  const centsPrice =
    product.priceCents !== undefined && product.priceCents !== null
      ? Number(product.priceCents) / 100
      : null;
  const centsSalePrice =
    product.salePriceCents !== undefined && product.salePriceCents !== null
      ? Number(product.salePriceCents) / 100
      : null;
  const saleMode =
    explicitSaleMode ||
    (Number(rawSalePrice ?? rawPrice ?? centsSalePrice ?? centsPrice ?? 0) > 0
      ? "direct"
      : "quote_only");
  const normalizedPrice =
    saleMode === "direct" ? asNumberOrNull(rawPrice ?? centsPrice) : null;
  const normalizedSalePrice =
    saleMode === "direct" ? asNumberOrNull(rawSalePrice ?? centsSalePrice) : null;

  return {
    ...product,
    id: product.id ?? product.uuid ?? product.slug ?? `product-${index + 1}`,
    slug: product.slug || slugify(name),
    name,
    description:
      product.description ||
      product.short_description ||
      product.shortDescription ||
      "Repuesto de sistema de enfriamiento para transporte pesado. Confirma compatibilidad con nuestro equipo técnico.",
    sku: product.sku || product.code || product.part_number || product.partNumber || "Consultar",
    brand,
    category,
    categorySlug:
      categoryObject?.slug || product.category_slug || product.categorySlug || slugify(category),
    image: firstImage,
    images: images
      .map((image) =>
        typeof image === "string"
          ? image
          : image?.url ||
            image?.src ||
            image?.localPath ||
            image?.originalUrl ||
            image?.image_url,
      )
      .filter(Boolean),
    price: normalizedPrice,
    salePrice: normalizedSalePrice,
    saleMode,
    stock: Number(
      product.availableQuantity ??
        product.stock?.quantity ??
        product.stock_quantity ??
        product.stockQuantity ??
        (typeof product.stock === "number" ? product.stock : 0),
    ),
    featured: Boolean(product.featured ?? product.is_featured ?? product.isFeatured),
    isNew: Boolean(product.is_new ?? product.isNew ?? product.new),
    active: product.active !== false && product.status !== "inactive",
  };
}

function extractProducts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.products)) return payload.data.products;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export async function loadProducts(signal) {
  try {
    const products = [];
    const limit = 100;
    let page = 1;
    let totalPages = 1;

    do {
      const response = await fetch(`/api/v1/products?page=${page}&limit=${limit}`, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Catalog API responded ${response.status}`);
      const payload = await response.json();
      const pageProducts = extractProducts(payload);
      products.push(...pageProducts);
      totalPages = Number(payload?.meta?.totalPages || 0);
      if (!totalPages) {
        const total = Number(payload?.meta?.total || 0);
        totalPages = total ? Math.ceil(total / limit) : pageProducts.length === limit ? page + 1 : page;
      }
      page += 1;
    } while (page <= totalPages && page <= 25);

    const normalized = products
      .map(normalizeProduct)
      .filter((product) => product.active);
    if (normalized.length) return normalized;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  try {
    const response = await fetch("/data/catalog.json", {
      signal,
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const products = extractProducts(await response.json())
        .map(normalizeProduct)
        .filter((product) => product.active);
      if (products.length) return products;
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  return FALLBACK_PRODUCTS.map(normalizeProduct);
}

export function formatPrice(product) {
  const price = product.salePrice ?? product.price;
  if (price === null || price === undefined) return "Cotizar";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
  }).format(price);
}

export function productFallbackImage(product) {
  const category = String(product?.categorySlug || "").toLowerCase();
  if (category.includes("intercool")) return `${ASSET_ROOT}/promo-intercooler.jpg`;
  if (category.includes("enfri")) return `${ASSET_ROOT}/promo-enfriadores.jpg`;
  return `${ASSET_ROOT}/promo-radiadores.jpg`;
}
