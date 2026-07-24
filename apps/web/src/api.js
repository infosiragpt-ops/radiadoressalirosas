const DEFAULT_API_BASE_URL = "/api/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

function resolveApiBaseUrl() {
  const configured = import.meta.env?.VITE_API_BASE_URL?.trim();
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

/**
 * API root used by the browser client.
 *
 * In production it defaults to the same-origin `/api/v1`. For a split local
 * frontend/backend setup, set VITE_API_BASE_URL to the complete API root, for
 * example `http://127.0.0.1:4000/api/v1`.
 */
export const API_BASE_URL = resolveApiBaseUrl();

export class ApiClientError extends Error {
  constructor(
    message,
    {
      status = 0,
      code = "api_error",
      details,
      payload,
      cause,
      retryable = false,
    } = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.payload = payload;
    this.retryable = retryable;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

function withQuery(path, params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function endpoint(path) {
  return `${API_BASE_URL}/${String(path).replace(/^\/+/, "")}`;
}

function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function isNativeRequestBody(body) {
  return (
    typeof body === "string" ||
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer)
  );
}

async function responsePayload(response) {
  const raw = await response.text();
  if (!raw) return null;

  const contentType = response.headers.get("content-type") || "";
  const looksJson =
    contentType.includes("application/json") ||
    raw.trimStart().startsWith("{") ||
    raw.trimStart().startsWith("[");

  if (!looksJson) return raw;

  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new ApiClientError("La API devolvió una respuesta JSON inválida", {
      status: response.status,
      code: "invalid_response",
      payload: raw,
      cause,
      retryable: response.status >= 500,
    });
  }
}

/**
 * Low-level JSON request helper.
 *
 * Cookies are always included because authentication uses an HTTP-only session
 * cookie. All thrown failures are normalized as ApiClientError.
 */
export async function apiRequest(
  path,
  {
    method = "GET",
    body,
    headers,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }

  let requestBody = body;
  if (body !== undefined && !isNativeRequestBody(body)) {
    if (!requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }
    requestBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    forwardAbort();
  } else {
    signal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const timeoutId =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await fetch(endpoint(path), {
      method,
      headers: requestHeaders,
      body: requestBody,
      credentials: "include",
      signal: controller.signal,
    });
    const payload = await responsePayload(response);

    if (!response.ok) {
      const apiError =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof payload.error === "object" &&
        payload.error !== null
          ? payload.error
          : null;
      throw new ApiClientError(
        apiError?.message ||
          (typeof payload === "string" && payload) ||
          `La solicitud falló con estado ${response.status}`,
        {
          status: response.status,
          code: apiError?.code || `http_${response.status}`,
          details: apiError?.details,
          payload,
          retryable: response.status === 429 || response.status >= 500,
        },
      );
    }

    return payload;
  } catch (cause) {
    if (cause instanceof ApiClientError) throw cause;

    if (controller.signal.aborted) {
      throw new ApiClientError(
        timedOut
          ? "La API tardó demasiado en responder"
          : "La solicitud fue cancelada",
        {
          code: timedOut ? "request_timeout" : "request_aborted",
          cause,
          retryable: timedOut,
        },
      );
    }

    throw new ApiClientError("No se pudo conectar con la API", {
      code: "network_error",
      cause,
      retryable: true,
    });
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function dataFrom(payload, operation) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    throw new ApiClientError(
      `La respuesta de ${operation} no contiene el campo data`,
      {
        code: "invalid_response",
        payload,
      },
    );
  }
  return payload.data;
}

function pageFrom(payload, operation) {
  const data = dataFrom(payload, operation);
  const meta = payload.meta;
  if (
    !Array.isArray(data) ||
    !meta ||
    typeof meta !== "object" ||
    !Number.isFinite(Number(meta.page)) ||
    !Number.isFinite(Number(meta.totalPages))
  ) {
    throw new ApiClientError(
      `La respuesta paginada de ${operation} no es válida`,
      {
        code: "invalid_response",
        payload,
      },
    );
  }
  return { data, meta };
}

// Authentication -----------------------------------------------------------

export async function register(
  { email, password, firstName, lastName, phone },
  options,
) {
  const payload = await apiRequest("/auth/register", {
    ...options,
    method: "POST",
    body: { email, password, firstName, lastName, phone },
  });
  return dataFrom(payload, "registro");
}

export async function login({ email, password }, options) {
  const payload = await apiRequest("/auth/login", {
    ...options,
    method: "POST",
    body: { email, password },
  });
  return dataFrom(payload, "inicio de sesión");
}

export async function logout(options) {
  await apiRequest("/auth/logout", { ...options, method: "POST" });
}

export async function getCurrentUser(options) {
  const payload = await apiRequest("/auth/me", options);
  return dataFrom(payload, "sesión actual");
}

// Public catalog -----------------------------------------------------------

export async function listProducts(query = {}, options) {
  const payload = await apiRequest(withQuery("/products", query), options);
  return pageFrom(payload, "productos");
}

/**
 * Fetches every page for the supplied product filters.
 *
 * `page` and `limit` in query are intentionally ignored; page size can be
 * configured in options and is capped by the API at 100.
 */
export async function getAllProducts(
  query = {},
  { pageSize = 100, maxPages = 1_000, ...options } = {},
) {
  const { page: _ignoredPage, limit: _ignoredLimit, ...filters } = query;
  const limit = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const products = [];
  const seenIds = new Set();
  let page = 1;
  let lastMeta = { page: 1, limit, total: 0, totalPages: 0 };

  while (page <= Math.max(1, Number(lastMeta.totalPages) || 1)) {
    if (page > maxPages) {
      throw new ApiClientError(
        `La paginación de productos excedió el límite de ${maxPages} páginas`,
        {
          code: "pagination_limit_exceeded",
          details: { maxPages },
        },
      );
    }

    const result = await listProducts(
      { ...filters, page, limit },
      options,
    );
    lastMeta = result.meta;

    for (const product of result.data) {
      const identity = product?.id ?? `${page}:${products.length}`;
      if (seenIds.has(identity)) continue;
      seenIds.add(identity);
      products.push(product);
    }

    const totalPages = Number(lastMeta.totalPages);
    if (!Number.isInteger(totalPages) || totalPages < 0) {
      throw new ApiClientError(
        "La API devolvió un total de páginas inválido",
        {
          code: "invalid_response",
          payload: result,
        },
      );
    }
    if (page >= totalPages) break;
    page += 1;
  }

  return {
    data: products,
    meta: {
      ...lastMeta,
      page: 1,
      limit,
      fetched: products.length,
    },
  };
}

export async function getProduct(identifier, options) {
  const payload = await apiRequest(
    `/products/${pathSegment(identifier)}`,
    options,
  );
  return dataFrom(payload, "producto");
}

export async function listCategories(options) {
  const payload = await apiRequest("/categories", options);
  return dataFrom(payload, "categorías");
}

export async function getPublicSettings(options) {
  const payload = await apiRequest("/settings", options);
  return dataFrom(payload, "configuración pública");
}

export async function getHealth(options) {
  return apiRequest("/health", options);
}

// Quotes -------------------------------------------------------------------

export async function createQuote(
  {
    contactName,
    contactEmail,
    contactPhone,
    companyName,
    message,
    items,
  },
  options,
) {
  const payload = await apiRequest("/quotes", {
    ...options,
    method: "POST",
    body: {
      contactName,
      contactEmail,
      contactPhone,
      companyName,
      message,
      items,
    },
  });
  return dataFrom(payload, "solicitud de cotización");
}

// Authenticated cart and orders -------------------------------------------

export async function getCart(options) {
  const payload = await apiRequest("/cart", options);
  return dataFrom(payload, "carrito");
}

export async function addCartItem(productId, quantity = 1, options) {
  const payload = await apiRequest("/cart/items", {
    ...options,
    method: "POST",
    body: { productId, quantity },
  });
  return dataFrom(payload, "agregar al carrito");
}

export async function updateCartItem(itemId, quantity, options) {
  const payload = await apiRequest(`/cart/items/${pathSegment(itemId)}`, {
    ...options,
    method: "PATCH",
    body: { quantity },
  });
  return dataFrom(payload, "actualizar el carrito");
}

export async function removeCartItem(itemId, options) {
  await apiRequest(`/cart/items/${pathSegment(itemId)}`, {
    ...options,
    method: "DELETE",
  });
}

export async function clearCart(options) {
  await apiRequest("/cart/items", { ...options, method: "DELETE" });
}

export async function checkout(
  { shippingAddress, notes, idempotencyKey },
  options = {},
) {
  const headers = new Headers(options.headers);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  const payload = await apiRequest("/checkout", {
    ...options,
    method: "POST",
    headers,
    body: { shippingAddress, notes, idempotencyKey },
  });

  return {
    data: dataFrom(payload, "checkout"),
    meta: payload.meta ?? {},
  };
}

export async function listOrders(query = {}, options) {
  const payload = await apiRequest(withQuery("/orders", query), options);
  return pageFrom(payload, "pedidos");
}

export async function getOrder(orderId, options) {
  const payload = await apiRequest(`/orders/${pathSegment(orderId)}`, options);
  return dataFrom(payload, "pedido");
}

// Staff/admin --------------------------------------------------------------

export async function listAdminProducts(query = {}, options) {
  const payload = await apiRequest(
    withQuery("/admin/products", query),
    options,
  );
  return pageFrom(payload, "productos de administración");
}

export async function createAdminProduct(product, options) {
  const payload = await apiRequest("/admin/products", {
    ...options,
    method: "POST",
    body: product,
  });
  return dataFrom(payload, "crear producto");
}

export async function updateAdminProduct(productId, changes, options) {
  const payload = await apiRequest(
    `/admin/products/${pathSegment(productId)}`,
    {
      ...options,
      method: "PATCH",
      body: changes,
    },
  );
  return dataFrom(payload, "actualizar producto");
}

export async function archiveAdminProduct(productId, options) {
  await apiRequest(`/admin/products/${pathSegment(productId)}`, {
    ...options,
    method: "DELETE",
  });
}

export async function getAdminStats(options) {
  const payload = await apiRequest("/admin/stats", options);
  return dataFrom(payload, "estadísticas de administración");
}

export async function listAdminQuotes(query = {}, options) {
  const payload = await apiRequest(
    withQuery("/admin/quotes", query),
    options,
  );
  return pageFrom(payload, "cotizaciones de administración");
}

export async function updateAdminQuote(quoteId, changes, options) {
  const payload = await apiRequest(
    `/admin/quotes/${pathSegment(quoteId)}`,
    {
      ...options,
      method: "PATCH",
      body: changes,
    },
  );
  return dataFrom(payload, "actualizar cotización");
}

export async function listAdminOrders(query = {}, options) {
  const payload = await apiRequest(withQuery("/admin/orders", query), options);
  return pageFrom(payload, "pedidos de administración");
}

export async function updateAdminOrderStatus(
  orderId,
  { status, note },
  options,
) {
  const payload = await apiRequest(
    `/admin/orders/${pathSegment(orderId)}/status`,
    {
      ...options,
      method: "PATCH",
      body: { status, note },
    },
  );
  return dataFrom(payload, "actualizar estado del pedido");
}

export const api = Object.freeze({
  request: apiRequest,
  auth: Object.freeze({
    register,
    login,
    logout,
    me: getCurrentUser,
  }),
  catalog: Object.freeze({
    listProducts,
    getAllProducts,
    getProduct,
    listCategories,
  }),
  quotes: Object.freeze({
    create: createQuote,
  }),
  cart: Object.freeze({
    get: getCart,
    addItem: addCartItem,
    updateItem: updateCartItem,
    removeItem: removeCartItem,
    clear: clearCart,
    checkout,
  }),
  orders: Object.freeze({
    list: listOrders,
    get: getOrder,
  }),
  admin: Object.freeze({
    listProducts: listAdminProducts,
    createProduct: createAdminProduct,
    updateProduct: updateAdminProduct,
    archiveProduct: archiveAdminProduct,
    stats: getAdminStats,
    listQuotes: listAdminQuotes,
    updateQuote: updateAdminQuote,
    listOrders: listAdminOrders,
    updateOrderStatus: updateAdminOrderStatus,
  }),
  settings: getPublicSettings,
  health: getHealth,
});
