import { CatalogPage, MobileNavigation } from "./Catalog.jsx";
import { Icon, Link, SmartImage, ProductCard, makeWhatsAppUrl, whatsappLink, PHONE } from "./shopUI.jsx";
import { productFamilies, familyById, matchesSearch } from "./productFamilies.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FALLBACK_PRODUCTS,
  formatPrice,
  loadProducts,
  normalizeProduct,
  productFallbackImage,
} from "./data.js";
import {
  ApiClientError,
  createAdminProduct,
  createQuote,
  getAdminStats,
  getCurrentUser,
  listAdminProducts,
  listAdminQuotes,
  listCategories,
  login,
  logout,
  register,
  updateAdminProduct,
  updateAdminQuote,
} from "./api.js";

const ASSET_ROOT = "/assets/original";
const STAFF_ROLES = new Set(["admin", "staff"]);
const BUSINESS_ADDRESS = "Av. Arequipa 2491, Lima, Perú, 0600";
const MAP_QUERY = encodeURIComponent("Av. Arequipa 2491, Lima, Perú");
const BUSINESS_MAP_EMBED = `https://maps.google.com/maps?q=${MAP_QUERY}&z=16&output=embed`;
const BUSINESS_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${MAP_QUERY}`;
const DISPLAY_PHONE = "+51 919 475 144";
const WEBSITE = "https://radiadoresclau.com";
const QUOTE_STATUS_LABELS = {
  new: "Nueva",
  contacted: "Contactada",
  quoted: "Cotizada",
  won: "Ganada",
  closed: "Cerrada",
};

const apiErrorMessage = (error, fallback = "Ocurrió un error inesperado") =>
  error instanceof ApiClientError || error instanceof Error
    ? error.message
    : fallback;

const splitFullName = (fullName) => {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  return {
    firstName: parts.shift(),
    lastName: parts.join(" "),
  };
};

const apiSlug = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const boundedApiSlug = (value, fallback = "producto") => {
  const normalized = apiSlug(value) || fallback;
  return normalized.slice(0, 160).replace(/-+$/g, "") || fallback;
};

const safeDecodePathSegment = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const readStoredCart = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("radiadores-clau-cart") ?? window.localStorage.getItem("salirosas-cart") ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => {
      const product = item?.product;
      const productIdType = typeof product?.id;
      const hasValidId =
        productIdType === "string" ||
        (productIdType === "number" && Number.isFinite(product.id));
      const hasDirectPrice =
        product?.saleMode === "direct" &&
        Number(product.salePrice ?? product.price) > 0;

      return (
        item &&
        typeof item === "object" &&
        product &&
        typeof product === "object" &&
        hasValidId &&
        typeof product.name === "string" &&
        product.name.length > 0 &&
        typeof product.slug === "string" &&
        product.slug.length > 0 &&
        typeof product.sku === "string" &&
        product.sku.length > 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 999 &&
        hasDirectPrice
      );
    });
  } catch {
    return [];
  }
};

async function loadAllAdminPages(loader, query = {}, options) {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await loader({ ...query, page, limit: 100 }, options);
    rows.push(...result.data);
    totalPages = Math.max(1, Number(result.meta?.totalPages) || 1);
    page += 1;
  } while (page <= totalPages);

  return rows;
}

function Brand() {
  return (
    <span className="clau-brand">
      <img src="/clau-icon.png" width="48" height="48" alt="" />
      <span className="clau-wordmark">
        <span>Radiadores</span>
        <strong>Clau <small>S.A.C.</small></strong>
      </span>
    </span>
  );
}

function makeCartWhatsAppUrl(items) {
  const lines = items.map(
    ({ product, quantity }) => `• ${quantity} × ${product.name} (${product.sku})`,
  );
  return whatsappLink(
    `Hola, deseo confirmar este pedido:\n${lines.join("\n")}\n\n¿Podrían indicarme disponibilidad y forma de entrega?`,
  );
}

function makeRecoveryWhatsAppUrl(email) {
  const text = `Hola, necesito recuperar el acceso a mi cuenta de Radiadores Clau S.A.C.${
    email ? ` asociada al correo ${email}.` : ""
  } ¿Podrían ayudarme a verificar mi identidad?`;
  return whatsappLink(text);
}

function useRoute() {
  const [route, setRoute] = useState(() => `${window.location.pathname}${window.location.search}`);

  useEffect(() => {
    const handlePopState = () => setRoute(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (to, { replace = false, scroll = true } = {}) => {
    const next = new URL(to, window.location.origin);
    const nextRoute = `${next.pathname}${next.search}`;
    if (nextRoute !== route) {
      if (replace) window.history.replaceState({}, "", nextRoute);
      else window.history.pushState({}, "", nextRoute);
    }
    setRoute(nextRoute);
    if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  };

  return { route, pathname: new URL(route, window.location.origin).pathname, navigate };
}

function Header({ products, cartCount, navigate, catalog }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchWrap = useRef(null);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    if (term.length < 2) return [];
    return products
      .filter((product) => matchesSearch(product, term))
      .slice(0, 6);
  }, [products, query]);

  useEffect(() => {
    const closeSearch = (event) => {
      if (!searchWrap.current?.contains(event.target)) setFocused(false);
    };
    document.addEventListener("pointerdown", closeSearch);
    return () => document.removeEventListener("pointerdown", closeSearch);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", mobileOpen);
    return () => document.body.classList.remove("menu-open");
  }, [mobileOpen]);

  const submitSearch = (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setFocused(false);
    setMobileOpen(false);
    navigate(`/store/?q=${encodeURIComponent(term)}`);
  };

  const closeAndNavigate = () => setMobileOpen(false);

  return (
    <header className={catalog ? "site-header catalog-header" : "site-header"}>
      <div className="header-inner">
        <Link to="/" navigate={navigate} className="brand-link" aria-label="Radiadores Clau S.A.C., inicio">
          <Brand />
        </Link>

        <div className="desktop-search" ref={searchWrap}>
          <form className="search-form" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={25} strokeWidth={2.1} />
            <label className="sr-only" htmlFor="header-search">
              Buscar productos
            </label>
            <input
              id="header-search"
              type="search"
              value={query}
              placeholder="Buscar productos ..."
              autoComplete="off"
              onFocus={() => setFocused(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setFocused(true);
              }}
            />
          </form>
          {focused && query.trim().length >= 2 && (
            <SearchResults
              results={results}
              query={query}
              navigate={navigate}
              onSelect={() => {
                setFocused(false);
                setQuery("");
              }}
            />
          )}
        </div>

        <nav className="desktop-nav" aria-label="Navegación principal">
          <Link to="/" navigate={navigate}>
            Catálogo
          </Link>
          <Link to="/nosotros/" navigate={navigate}>
            Nosotros
          </Link>
          <Link to="/contacto/" navigate={navigate}>
            Contacto
          </Link>
        </nav>

        <div className="header-actions">
          <Link
            to="/cart/"
            navigate={navigate}
            className="header-icon-link cart-link"
            aria-label={`Carrito, ${cartCount} productos`}
          >
            <Icon name="cart" size={24} strokeWidth={2} />
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </Link>
          <Link
            to="/my-account/"
            navigate={navigate}
            className="header-icon-link desktop-account"
            aria-label="Mi cuenta"
          >
            <Icon name="user" size={25} strokeWidth={2} />
          </Link>
          <button
            className="menu-button"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Icon name={mobileOpen ? "close" : "menu"} size={34} strokeWidth={2.1} />
          </button>
        </div>
      </div>

      <div className={`mobile-menu-backdrop ${mobileOpen ? "is-open" : ""}`} onClick={() => setMobileOpen(false)} />
      <div id="mobile-menu" className={`mobile-menu ${mobileOpen ? "is-open" : ""}`}>
        <form className="mobile-search-form" role="search" onSubmit={submitSearch}>
          <Icon name="search" size={22} />
          <label className="sr-only" htmlFor="mobile-search">
            Buscar productos
          </label>
          <input
            id="mobile-search"
            type="search"
            value={query}
            placeholder="Buscar por nombre o código"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        {query.trim().length >= 2 && (
          <SearchResults
            mobile
            results={results}
            query={query}
            navigate={navigate}
            onSelect={() => {
              setQuery("");
              setMobileOpen(false);
            }}
          />
        )}
        <nav aria-label="Navegación móvil">
          {[
            ["/", "Catálogo"],
            ["/nosotros/", "Nosotros"],
            ["/contacto/", "Contacto"],
            ["/my-account/", "Mi cuenta"],
          ].map(([to, label]) => (
            <Link key={to} to={to} navigate={navigate} onClick={closeAndNavigate}>
              {label}
              <Icon name="chevron" size={19} />
            </Link>
          ))}
        </nav>
        <a className="mobile-menu-help" href={makeWhatsAppUrl()} target="_blank" rel="noreferrer">
          <Icon name="whatsapp" size={22} />
          Asesoría por WhatsApp
        </a>
      </div>
    </header>
  );
}

function SearchResults({ results, query, navigate, onSelect, mobile = false }) {
  return (
    <div className={`search-results ${mobile ? "search-results-mobile" : ""}`} role="region" aria-live="polite">
      {results.length ? (
        <>
          <div className="search-results-label">Resultados para “{query.trim()}”</div>
          {results.map((product) => (
            <Link
              key={product.id}
              to={`/producto/${product.slug}`}
              navigate={navigate}
              className="search-result"
              onClick={onSelect}
            >
              <SmartImage
                src={product.image}
                fallback={productFallbackImage(product)}
                alt=""
              />
              <span>
                <strong>{product.name}</strong>
                <small>{product.brand} · {product.sku}</small>
              </span>
              <Icon name="chevron" size={17} />
            </Link>
          ))}
          <Link
            to={`/store/?q=${encodeURIComponent(query.trim())}`}
            navigate={navigate}
            className="search-all-link"
            onClick={onSelect}
          >
            Ver todos los resultados
          </Link>
        </>
      ) : (
        <div className="search-empty">
          No encontramos coincidencias. Prueba con la marca o el código de pieza.
        </div>
      )}
    </div>
  );
}

function ProductSection({ title, products, navigate, onAdd, linkLabel, limit = 10 }) {
  const visible = products.slice(0, limit);
  if (!visible.length) return null;
  return (
    <section className="product-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {linkLabel && (
          <Link to="/store/" navigate={navigate} className="section-link">
            {linkLabel}
            <Icon name="chevron" size={18} />
          </Link>
        )}
      </div>
      <div className="product-grid">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} navigate={navigate} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

function Breadcrumbs({ items, navigate }) {
  return (
    <nav className="breadcrumbs" aria-label="Ruta de navegación">
      <Link to="/" navigate={navigate}>
        Inicio
      </Link>
      {items.map(([to, label], index) => (
        <span key={`${label}-${index}`}>
          <Icon name="chevron" size={14} />
          {to ? <Link to={to} navigate={navigate}>{label}</Link> : <span>{label}</span>}
        </span>
      ))}
    </nav>
  );
}

function ProductPage({ product, products, navigate, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const directSale =
    product?.saleMode === "direct" && Number(product?.salePrice ?? product?.price) > 0;

  if (!product) {
    return (
      <main className="page-shell">
        <div className="not-found">
          <h1>Producto no encontrado</h1>
          <p>El producto solicitado no está disponible o cambió de dirección.</p>
          <Link to="/store/" navigate={navigate} className="button button-primary">
            Volver al catálogo
          </Link>
        </div>
      </main>
    );
  }

  const family = familyById.get(product.familyId);
  const related = products
    .filter((candidate) => candidate.id !== product.id && candidate.familyId === product.familyId)
    .sort((a, b) => Number(b.brand === product.brand) - Number(a.brand === product.brand))
    .slice(0, 5);

  return (
    <main className="page-shell product-page">
      <Breadcrumbs
        navigate={navigate}
        items={[
          ["/store/", "Productos"],
          [`/store/?tipo=${family.id}`, family.label],
          [null, product.name],
        ]}
      />
      <section className="product-detail">
        <div className="product-gallery">
          {product.isNew && <span className="product-badge">Nuevo ingreso</span>}
          <SmartImage
            src={product.image}
            fallback={productFallbackImage(product)}
            alt={product.name}
          />
        </div>
        <div className="product-summary">
          <Link
            to={`/store/?tipo=${family.id}`}
            navigate={navigate}
            className="product-detail-category"
          >
            {family.label}
          </Link>
          <h1>{product.name}</h1>
          <div className="product-meta">
            <span>Marca: <strong>{product.brand}</strong></span>
            <span>Código: <strong>{product.sku}</strong></span>
          </div>
          <div className={`detail-price ${directSale ? "" : "is-quote"}`}>
            {directSale ? formatPrice(product) : "Precio a cotizar"}
          </div>
          <p className="product-description">{product.description}</p>
          <div className="compatibility-note">
            <Icon name="check" size={20} />
            <div>
              <strong>Compra con compatibilidad verificada</strong>
              <span>Envíanos el modelo y año del vehículo antes de confirmar.</span>
            </div>
          </div>
          <div className="purchase-row">
            <QuantityControl value={quantity} setValue={setQuantity} />
            {directSale ? (
              <button
                type="button"
                className="button button-primary add-detail-button"
                onClick={() => onAdd(product, quantity)}
              >
                <Icon name="cart" size={20} />
                Agregar al carrito
              </button>
            ) : (
              <a
                href={makeWhatsAppUrl(product, quantity)}
                target="_blank"
                rel="noreferrer"
                className="button button-whatsapp add-detail-button"
              >
                <Icon name="whatsapp" size={21} />
                Cotizar por WhatsApp
              </a>
            )}
          </div>
          {directSale && (
            <a
              href={makeWhatsAppUrl(product, quantity)}
              target="_blank"
              rel="noreferrer"
              className="whatsapp-text-link"
            >
              <Icon name="whatsapp" size={20} />
              Consultar compatibilidad por WhatsApp
            </a>
          )}
          <div className="service-points">
            <div>
              <strong>Asesoría técnica</strong>
              <span>Especialistas en transporte pesado</span>
            </div>
            <div>
              <strong>Envíos nacionales</strong>
              <span>Coordinación segura a todo el Perú</span>
            </div>
          </div>
        </div>
      </section>
      <ProductSection
        title="Productos relacionados"
        products={related.length ? related : products.filter((candidate) => candidate.id !== product.id)}
        navigate={navigate}
        onAdd={onAdd}
        limit={5}
      />
    </main>
  );
}

function QuantityControl({ value, setValue, compact = false }) {
  return (
    <div className={`quantity-control ${compact ? "is-compact" : ""}`}>
      <button
        type="button"
        onClick={() => setValue(Math.max(1, value - 1))}
        aria-label="Reducir cantidad"
      >
        <Icon name="minus" size={16} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => setValue(value + 1)} aria-label="Aumentar cantidad">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

function AboutPage({ navigate }) {
  const values = [
    ["Experiencia especializada", "Conocemos las exigencias térmicas de buses, camiones y tractocamiones."],
    ["Asesoría responsable", "Verificamos códigos, medidas y compatibilidad antes de cada cotización."],
    ["Mantenimiento", "Revisamos el radiador de tu bus o camión y coordinamos los trabajos que necesita."],
  ];
  return (
    <main className="about-page">
      <section className="inner-hero about-hero">
        <div className="inner-hero-copy">
          <span>Radiadores Clau S.A.C.</span>
          <h1>Mantenimiento y ventas de radiadores para buses y camiones</h1>
          <p>
            Soluciones confiables para mantener operativa la flota de transporte pesado.
          </p>
        </div>
        <SmartImage
          src={`${ASSET_ROOT}/hero-2.jpg`}
          fallback={`${ASSET_ROOT}/hero-1.jpg`}
          alt="Radiadores y enfriadores para transporte pesado"
        />
      </section>
      <section className="story-section page-shell">
        <div className="story-copy">
          <span className="section-kicker">Quiénes somos</span>
          <h2>Un aliado técnico para cada ruta</h2>
          <p>
            Somos una empresa peruana enfocada en radiadores, intercoolers, enfriadores de aceite,
            condensadores y componentes para camiones americanos, europeos y chinos.
          </p>
          <p>
            Trabajamos con referencias para Freightliner, International, Kenworth, Mack, Scania,
            Volvo, Mercedes-Benz, MAN, Volkswagen, Sinotruk, Shacman y Foton. Nuestro proceso parte
            de una identificación precisa de la pieza para que cada cliente reciba una solución
            adecuada a su unidad.
          </p>
          <Link to="/contacto/" navigate={navigate} className="button button-primary">
            Hablar con un especialista
          </Link>
        </div>
        <div className="story-panel">
          <strong>Nuestra prioridad</strong>
          <blockquote>
            Que cada unidad vuelva a la ruta con el componente correcto y el respaldo de una
            atención profesional.
          </blockquote>
        </div>
      </section>
      <section className="values-section">
        <div className="page-shell">
          <div className="section-heading">
            <h2>Cómo trabajamos</h2>
          </div>
          <div className="values-grid">
            {values.map(([title, description], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function ContactPage() {
  const [createdRequest, setCreatedRequest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const vehicle = String(values.get("vehicle") || "").trim();
    const sku = String(values.get("sku") || "").trim();
    const customerMessage = String(values.get("message") || "").trim();
    const details = [
      vehicle && `Vehículo: ${vehicle}`,
      sku && `Código de pieza: ${sku}`,
      customerMessage,
    ].filter(Boolean);

    setSubmitting(true);
    setSubmitError("");
    try {
      const request = await createQuote({
        contactName: String(values.get("name") || "").trim(),
        contactPhone: String(values.get("phone") || "").trim(),
        contactEmail: String(values.get("email") || "").trim(),
        message: details.join("\n"),
        items: [],
      });
      setCreatedRequest(request);
      form.reset();
    } catch (error) {
      setSubmitError(
        apiErrorMessage(
          error,
          "No pudimos registrar tu solicitud. Inténtalo nuevamente.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="contact-page page-shell">
      <div className="contact-heading">
        <span>Contacto</span>
        <h1>Encuentra el repuesto correcto con ayuda especializada</h1>
        <p>
          Cuéntanos la marca, modelo, año y código de la pieza. Nuestro equipo revisará la
          compatibilidad antes de cotizar.
        </p>
      </div>
      <div className="contact-layout">
        <section className="contact-info">
          <h2>Estamos para ayudarte</h2>
          <a href={makeWhatsAppUrl()} target="_blank" rel="noreferrer">
            <span><Icon name="whatsapp" size={23} /></span>
            <div><strong>WhatsApp comercial</strong><small>{DISPLAY_PHONE}</small></div>
            <Icon name="chevron" size={19} />
          </a>
          <div className="contact-info-row">
            <span><Icon name="pin" size={22} /></span>
            <div><strong>Dirección del taller</strong><small>{BUSINESS_ADDRESS}</small></div>
          </div>
          <div className="contact-hours">
            <strong>Visita el taller</strong>
            <p><a href={BUSINESS_DIRECTIONS} target="_blank" rel="noreferrer">Ver cómo llegar</a></p>
          </div>
        </section>
        <section className="contact-form-panel">
          {createdRequest ? (
            <div className="form-success" role="status">
              <span><Icon name="check" size={30} /></span>
              <h2>Solicitud recibida</h2>
              <p>
                Gracias por escribirnos. Tu número de solicitud es{" "}
                <strong>{createdRequest.requestNumber}</strong>. Revisaremos los datos de tu unidad
                para responderte.
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setCreatedRequest(null);
                  setSubmitError("");
                }}
              >
                Enviar otra consulta
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2>Solicita una cotización</h2>
              <div className="form-grid">
                <label>
                  Nombre completo
                  <input name="name" type="text" required autoComplete="name" />
                </label>
                <label>
                  Teléfono
                  <input name="phone" type="tel" required autoComplete="tel" />
                </label>
              </div>
              <label>
                Correo electrónico
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <div className="form-grid">
                <label>
                  Marca y modelo
                  <input name="vehicle" type="text" required placeholder="Ej. Volvo FH 2022" />
                </label>
                <label>
                  Código de pieza
                  <input name="sku" type="text" placeholder="Si lo tienes disponible" />
                </label>
              </div>
              <label>
                ¿Qué producto necesitas?
                <textarea name="message" rows="5" required />
              </label>
              {submitError && (
                <p className="form-error" role="alert">
                  {submitError}
                </p>
              )}
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting}
              >
                {submitting ? "Registrando solicitud…" : "Enviar solicitud"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function CartPage({ cart, setCart, navigate }) {
  const updateQuantity = (id, quantity) => {
    setCart((items) =>
      items.map((item) => (item.product.id === id ? { ...item, quantity } : item)),
    );
  };
  const remove = (id) =>
    setCart((items) => items.filter((item) => item.product.id !== id));
  const total = cart.reduce(
    (sum, item) =>
      sum + Number(item.product.salePrice ?? item.product.price ?? 0) * item.quantity,
    0,
  );

  return (
    <main className="cart-page page-shell">
      <Breadcrumbs navigate={navigate} items={[[null, "Carrito"]]} />
      <div className="page-title">
        <h1>Tu carrito</h1>
        <p>{cart.length ? `${cart.length} producto${cart.length === 1 ? "" : "s"} en tu pedido` : "Aún no agregaste productos"}</p>
      </div>
      {!cart.length ? (
        <div className="empty-state cart-empty">
          <Icon name="cart" size={44} />
          <h2>Tu carrito está vacío</h2>
          <p>Explora el catálogo y encuentra el componente que necesita tu unidad.</p>
          <Link to="/store/" navigate={navigate} className="button button-primary">
            Ver productos
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-list" aria-label="Productos del carrito">
            {cart.map(({ product, quantity }) => (
              <article className="cart-item" key={product.id}>
                <SmartImage
                  src={product.image}
                  fallback={productFallbackImage(product)}
                  alt={product.name}
                />
                <div className="cart-item-copy">
                  <span>{product.brand}</span>
                  <h2>
                    <Link to={`/producto/${product.slug}`} navigate={navigate}>{product.name}</Link>
                  </h2>
                  <small>Código: {product.sku}</small>
                  <strong>{formatPrice(product)}</strong>
                </div>
                <QuantityControl
                  compact
                  value={quantity}
                  setValue={(next) => updateQuantity(product.id, next)}
                />
                <button
                  type="button"
                  className="remove-item"
                  onClick={() => remove(product.id)}
                  aria-label={`Eliminar ${product.name}`}
                >
                  <Icon name="trash" size={20} />
                </button>
              </article>
            ))}
          </section>
          <aside className="cart-summary">
            <h2>Resumen del pedido</h2>
            <div><span>Subtotal</span><strong>{new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(total)}</strong></div>
            <div><span>Envío</span><span>Se coordina al confirmar</span></div>
            <div className="cart-total"><span>Total</span><strong>{new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(total)}</strong></div>
            <a
              href={makeCartWhatsAppUrl(cart)}
              target="_blank"
              rel="noreferrer"
              className="button button-whatsapp"
            >
              <Icon name="whatsapp" size={21} />
              Confirmar por WhatsApp
            </a>
            <p>Un asesor validará existencias, compatibilidad, entrega y forma de pago.</p>
          </aside>
        </div>
      )}
    </main>
  );
}

function AccountPage({ navigate }) {
  const [mode, setMode] = useState("login");
  const [accountSection, setAccountSection] = useState("summary");
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser({ signal: controller.signal })
      .then((currentUser) => setUser(currentUser))
      .catch((error) => {
        if (error?.code === "request_aborted") return;
        if (error?.status !== 401) {
          setAuthError(
            apiErrorMessage(
              error,
              "No pudimos comprobar tu sesión. Inténtalo nuevamente.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingSession(false);
      });
    return () => controller.abort();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const credentials = {
      email: String(values.get("email") || "").trim(),
      password: String(values.get("password") || ""),
    };

    setAuthBusy(true);
    setAuthError("");
    try {
      if (mode === "register") {
        const fullName = splitFullName(values.get("name"));
        if (!fullName) {
          setAuthError("Ingresa tu nombre y al menos un apellido.");
          return;
        }
        const createdUser = await register({
          ...credentials,
          ...fullName,
          phone: String(values.get("phone") || "").trim() || undefined,
        });
        setUser(createdUser);
      } else {
        setUser(await login(credentials));
      }
    } catch (error) {
      setAuthError(
        apiErrorMessage(
          error,
          mode === "register"
            ? "No pudimos crear tu cuenta."
            : "No pudimos iniciar sesión.",
        ),
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await logout();
      setUser(null);
      setMode("login");
      setAccountSection("summary");
    } catch (error) {
      setAuthError(apiErrorMessage(error, "No pudimos cerrar tu sesión."));
    } finally {
      setAuthBusy(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="account-page page-shell">
        <div className="account-session-loading" role="status">
          <span className="loading-mark" />
          <p>Comprobando tu sesión…</p>
        </div>
      </main>
    );
  }

  if (user) {
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    const accountType =
      user.role === "admin"
        ? "Cuenta administradora"
        : user.role === "staff"
          ? "Cuenta del equipo"
          : "Cuenta de cliente";
    return (
      <main className="account-page page-shell">
        <div className="account-dashboard">
          <aside>
            <div className="account-avatar">{name.charAt(0).toUpperCase()}</div>
            <strong>{name}</strong>
            <span>{accountType}</span>
            <nav>
              <button
                type="button"
                className={accountSection === "summary" ? "is-active" : ""}
                aria-current={accountSection === "summary" ? "page" : undefined}
                onClick={() => setAccountSection("summary")}
              >
                Resumen
              </button>
              <button
                type="button"
                className={accountSection === "quotes" ? "is-active" : ""}
                aria-current={accountSection === "quotes" ? "page" : undefined}
                onClick={() => setAccountSection("quotes")}
              >
                Cotizaciones
              </button>
              <button
                type="button"
                className={accountSection === "profile" ? "is-active" : ""}
                aria-current={accountSection === "profile" ? "page" : undefined}
                onClick={() => setAccountSection("profile")}
              >
                Datos de cuenta
              </button>
              {STAFF_ROLES.has(user.role) && (
                <button type="button" onClick={() => navigate("/admin/")}>
                  Administración
                </button>
              )}
              <button type="button" onClick={handleLogout} disabled={authBusy}>
                {authBusy ? "Cerrando sesión…" : "Cerrar sesión"}
              </button>
            </nav>
          </aside>
          <section>
            <span>Mi cuenta</span>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            {accountSection === "summary" && (
              <>
                <h1>Bienvenido, {name}</h1>
                <p>Desde aquí podrás consultar tus solicitudes y revisar los datos de tu cuenta.</p>
                <div className="account-cards">
                  <article><Icon name="quote" size={25} /><strong>Seguimiento de cotizaciones</strong><span>Consulta tus solicitudes usando el número de atención recibido.</span></article>
                  <article><Icon name="box" size={25} /><strong>{user.email}</strong><span>Correo asociado a tu sesión.</span></article>
                </div>
                <Link to="/store/" navigate={navigate} className="button button-primary">Ir a productos</Link>
              </>
            )}
            {accountSection === "quotes" && (
              <>
                <h1>Mis cotizaciones</h1>
                <p>
                  Conserva el número de solicitud que recibiste al enviar tu consulta. Nuestro
                  equipo puede confirmar su estado y los detalles de compatibilidad.
                </p>
                <div className="account-cards">
                  <article><Icon name="quote" size={25} /><strong>Consulta una solicitud</strong><span>Comparte tu número COT con el equipo comercial para recibir seguimiento.</span></article>
                  <article><Icon name="whatsapp" size={25} /><strong>Atención especializada</strong><span>Validamos código, unidad y disponibilidad antes de cotizar.</span></article>
                </div>
                <Link to="/contacto/" navigate={navigate} className="button button-primary">Solicitar nueva cotización</Link>
              </>
            )}
            {accountSection === "profile" && (
              <>
                <h1>Datos de cuenta</h1>
                <p>Estos son los datos asociados a la sesión activa.</p>
                <div className="account-cards">
                  <article><Icon name="user" size={25} /><strong>{name}</strong><span>Nombre registrado</span></article>
                  <article><Icon name="mail" size={25} /><strong>{user.email}</strong><span>Correo electrónico</span></article>
                  <article><Icon name="phone" size={25} /><strong>{user.phone || "No registrado"}</strong><span>Teléfono de contacto</span></article>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="account-page page-shell">
      <div className="account-auth">
        <section className="account-intro">
          <SmartImage
            src={`${ASSET_ROOT}/hero-1.jpg`}
            fallback={`${ASSET_ROOT}/hero-2.jpg`}
            alt="Sistemas de enfriamiento para transporte pesado"
          />
          <div>
            <h1>Tu cuenta Clau</h1>
            <p>Guarda tus datos y mantén todas tus solicitudes organizadas.</p>
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={mode === "login" ? "is-active" : ""}
              onClick={() => {
                setMode("login");
                setAuthError("");
              }}
            >
              Ingresar
            </button>
            <button
              type="button"
              className={mode === "register" ? "is-active" : ""}
              onClick={() => {
                setMode("register");
                setAuthError("");
              }}
            >
              Crear cuenta
            </button>
          </div>
          <form onSubmit={submit}>
            <h2>{mode === "login" ? "Bienvenido nuevamente" : "Crea tu cuenta"}</h2>
            <p>{mode === "login" ? "Ingresa tus datos para continuar." : "Completa tus datos para comenzar."}</p>
            {mode === "register" && (
              <label>Nombre completo<input name="name" type="text" required autoComplete="name" /></label>
            )}
            <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
            {mode === "register" && (
              <label>Teléfono<input name="phone" type="tel" autoComplete="tel" minLength="6" /></label>
            )}
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 12 : 1}
                maxLength="128"
                pattern={
                  mode === "register"
                    ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,128}"
                    : undefined
                }
                title={
                  mode === "register"
                    ? "Usa al menos 12 caracteres, una mayúscula, una minúscula y un número."
                    : undefined
                }
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
            {mode === "register" && (
              <small className="password-help">
                Mínimo 12 caracteres, con mayúscula, minúscula y número.
              </small>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="forgot-link"
                onClick={() => navigate("/recuperar-contrasena/")}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button
              type="submit"
              className="button button-primary"
              disabled={authBusy}
            >
              {authBusy
                ? mode === "login"
                  ? "Ingresando…"
                  : "Creando cuenta…"
                : mode === "login"
                  ? "Ingresar"
                  : "Crear cuenta"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function PasswordRecoveryPage({ navigate }) {
  const [email, setEmail] = useState("");

  const requestRecovery = (event) => {
    event.preventDefault();
    const supportWindow = window.open(
      makeRecoveryWhatsAppUrl(email.trim()),
      "_blank",
      "noopener,noreferrer",
    );
    if (supportWindow) supportWindow.opener = null;
  };

  return (
    <main className="account-page page-shell">
      <div className="account-auth">
        <section className="account-intro">
          <SmartImage
            src={`${ASSET_ROOT}/hero-1.jpg`}
            fallback={`${ASSET_ROOT}/hero-2.jpg`}
            alt="Sistemas de enfriamiento para transporte pesado"
          />
          <div>
            <h1>Recupera tu cuenta</h1>
            <p>El equipo verificará tu identidad antes de restablecer el acceso.</p>
          </div>
        </section>
        <section className="auth-panel">
          <form onSubmit={requestRecovery}>
            <h2>Solicita ayuda de acceso</h2>
            <p>
              Indica el correo asociado a tu cuenta y continúa por el canal oficial de WhatsApp.
            </p>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength="254"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button type="submit" className="button button-whatsapp">
              <Icon name="whatsapp" size={21} />
              Solicitar verificación por WhatsApp
            </button>
            <Link to="/my-account/" navigate={navigate} className="forgot-link">
              Volver al inicio de sesión
            </Link>
          </form>
        </section>
      </div>
    </main>
  );
}

function AdminAccessGate({
  deniedUser,
  busy,
  error,
  onLogin,
  onLogout,
}) {
  if (deniedUser) {
    const deniedName =
      `${deniedUser.firstName || ""} ${deniedUser.lastName || ""}`.trim() ||
      deniedUser.email;
    return (
      <main className="admin-access-page page-shell">
        <section className="admin-access-card">
          <span className="admin-access-icon"><Icon name="user" size={30} /></span>
          <h1>Acceso denegado</h1>
          <p>
            La sesión de <strong>{deniedName}</strong> corresponde a una cuenta de cliente.
            Este panel está reservado para el equipo autorizado.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            type="button"
            className="button button-primary"
            onClick={onLogout}
            disabled={busy}
          >
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-access-page page-shell">
      <div className="account-auth admin-auth-layout">
        <section className="account-intro">
          <SmartImage
            src={`${ASSET_ROOT}/hero-1.jpg`}
            fallback={`${ASSET_ROOT}/hero-2.jpg`}
            alt="Sistemas de enfriamiento para transporte pesado"
          />
          <div>
            <h1>Panel de Radiadores Clau</h1>
            <p>Acceso restringido para la gestión del catálogo y las cotizaciones.</p>
          </div>
        </section>
        <section className="auth-panel">
          <form onSubmit={onLogin}>
            <span className="admin-login-kicker">Administración</span>
            <h2>Inicia sesión</h2>
            <p>Usa una cuenta del equipo o de administración.</p>
            <label>
              Correo electrónico
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                required
                maxLength="128"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy ? "Verificando…" : "Ingresar al panel"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function AdminPage({ products, navigate }) {
  const [access, setAccess] = useState("checking");
  const [sessionUser, setSessionUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [section, setSection] = useState("Resumen");
  const [search, setSearch] = useState("");
  const [localProducts, setLocalProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [stats, setStats] = useState(null);
  const [adminCategories, setAdminCategories] = useState([]);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [updatingProductId, setUpdatingProductId] = useState(null);
  const [updatingQuoteId, setUpdatingQuoteId] = useState(null);

  const decorateProducts = (rows) =>
    rows.map((row, index) => {
      const match = products.find(
        (product) =>
          String(product.id) === String(row.id) ||
          String(product.sku).toUpperCase() === String(row.sku).toUpperCase(),
      );
      const normalized = normalizeProduct(
        {
          ...match,
          ...row,
          category: row.categoryName || match?.category || "Sin categoría",
          image: match?.image || "",
          images: match?.images || [],
          stock: row.inventoryQuantity,
        },
        index,
      );
      return {
        ...normalized,
        active: row.isActive !== false,
        featured: Boolean(row.isFeatured),
        saleMode: row.saleMode || "quote_only",
      };
    });

  const refreshAdminData = async (options) => {
    setDataBusy(true);
    setDataError("");
    try {
      const [nextStats, productRows, quoteRows, categories] = await Promise.all([
        getAdminStats(options),
        loadAllAdminPages(listAdminProducts, {}, options),
        loadAllAdminPages(listAdminQuotes, {}, options),
        listCategories(options),
      ]);
      setStats(nextStats);
      setLocalProducts(decorateProducts(productRows));
      setQuotes(quoteRows);
      setAdminCategories(categories);
    } catch (error) {
      if (error?.code !== "request_aborted") {
        setDataError(
          apiErrorMessage(
            error,
            "No pudimos cargar los datos de administración.",
          ),
        );
      }
    } finally {
      if (!options?.signal?.aborted) setDataBusy(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const restoreSession = async () => {
      try {
        const user = await getCurrentUser({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setSessionUser(user);
        if (!STAFF_ROLES.has(user.role)) {
          setAccess("denied");
          return;
        }
        setAccess("ready");
        await refreshAdminData({ signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted || error?.code === "request_aborted") return;
        setAccess("anonymous");
        if (error?.status !== 401) {
          setAuthError(
            apiErrorMessage(
              error,
              "No pudimos comprobar la sesión de administración.",
            ),
          );
        }
      }
    };
    restoreSession();
    return () => controller.abort();
  }, []);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setAuthBusy(true);
    setAuthError("");
    try {
      const user = await login({
        email: String(values.get("email") || "").trim(),
        password: String(values.get("password") || ""),
      });
      setSessionUser(user);
      if (!STAFF_ROLES.has(user.role)) {
        setAccess("denied");
        return;
      }
      setAccess("ready");
      await refreshAdminData();
    } catch (error) {
      setAuthError(apiErrorMessage(error, "No pudimos iniciar sesión."));
      setAccess("anonymous");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await logout();
      setSessionUser(null);
      setAccess("anonymous");
      setLocalProducts([]);
      setQuotes([]);
      setStats(null);
    } catch (error) {
      setAuthError(apiErrorMessage(error, "No pudimos cerrar la sesión."));
    } finally {
      setAuthBusy(false);
    }
  };

  const createProduct = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const sku = String(form.get("sku") || "").trim().toUpperCase();
    const match = products.find(
      (product) => String(product.sku).toUpperCase() === sku,
    );
    setCreateBusy(true);
    setCreateError("");
    try {
      await createAdminProduct({
        categoryId: String(form.get("categoryId") || "") || null,
        sku,
        slug: boundedApiSlug(`${name}-${sku}`),
        name,
        description: `Repuesto ${name} disponible para evaluación técnica y cotización.`,
        shortDescription: "Confirma compatibilidad con nuestro equipo técnico.",
        brand: String(form.get("brand") || "").trim() || null,
        priceCents: 0,
        compareAtPriceCents: null,
        currency: "PEN",
        saleMode: "quote_only",
        isActive: true,
        isFeatured: false,
        metadata: form.get("family") ? { catalogFamily: form.get("family") } : {},
        inventoryQuantity: 0,
        lowStockThreshold: 5,
        images: match?.image
          ? [{ url: match.image, altText: name }]
          : [],
      });
      await refreshAdminData();
      formElement.reset();
      setShowCreate(false);
    } catch (error) {
      setCreateError(
        apiErrorMessage(error, "No pudimos crear el producto."),
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const toggleProduct = async (product) => {
    const nextActive = product.active === false;
    setUpdatingProductId(product.id);
    setDataError("");
    try {
      await updateAdminProduct(product.id, { isActive: nextActive });
      setLocalProducts((items) =>
        items.map((item) =>
          item.id === product.id ? { ...item, active: nextActive } : item,
        ),
      );
      setStats(await getAdminStats());
    } catch (error) {
      setDataError(
        apiErrorMessage(error, "No pudimos actualizar el producto."),
      );
    } finally {
      setUpdatingProductId(null);
    }
  };

  const changeQuoteStatus = async (quote, status) => {
    if (status === quote.status) return;
    setUpdatingQuoteId(quote.id);
    setDataError("");
    try {
      const updated = await updateAdminQuote(quote.id, { status });
      setQuotes((items) =>
        items.map((item) =>
          item.id === quote.id
            ? { ...item, status: updated.status || status }
            : item,
        ),
      );
      try {
        setStats(await getAdminStats());
      } catch (error) {
        setDataError(
          `El estado se actualizó, pero no pudimos refrescar las métricas: ${apiErrorMessage(
            error,
            "inténtalo nuevamente",
          )}`,
        );
      }
    } catch (error) {
      setDataError(
        apiErrorMessage(error, "No pudimos actualizar la cotización."),
      );
    } finally {
      setUpdatingQuoteId(null);
    }
  };

  if (access === "checking") {
    return (
      <div className="loading-screen" role="status">
        <span className="loading-mark" />
        <p>Comprobando acceso al panel…</p>
      </div>
    );
  }

  if (access !== "ready") {
    return (
      <AdminAccessGate
        deniedUser={access === "denied" ? sessionUser : null}
        busy={authBusy}
        error={authError}
        onLogin={handleAdminLogin}
        onLogout={handleAdminLogout}
      />
    );
  }

  const visibleProducts = localProducts.filter((product) =>
    `${product.name} ${product.sku} ${product.brand}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const categories = Array.from(
    new Set(localProducts.map((product) => product.category)),
  ).sort();
  const adminName =
    `${sessionUser?.firstName || ""} ${sessionUser?.lastName || ""}`.trim() ||
    sessionUser?.email ||
    "Equipo Clau";
  const initials =
    `${sessionUser?.firstName?.[0] || ""}${sessionUser?.lastName?.[0] || ""}` ||
    adminName.slice(0, 2);
  const roleLabel =
    sessionUser?.role === "admin" ? "Administrador" : "Equipo de atención";
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="admin-logo">
          <Brand />
        </a>
        <span className="admin-label">Administración</span>
        <nav>
          {[
            ["Resumen", "dashboard"],
            ["Productos", "box"],
            ["Categorías", "category"],
            ["Cotizaciones", "quote"],
          ].map(([label, icon]) => (
            <button
              type="button"
              key={label}
              className={section === label ? "is-active" : ""}
              onClick={() => setSection(label)}
            >
              <Icon name={icon} size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-actions">
          <a href="/" className="back-to-site">
            <Icon name="arrowLeft" size={18} />
            Volver al sitio
          </a>
          <button type="button" onClick={handleAdminLogout} disabled={authBusy}>
            <Icon name="user" size={18} />
            {authBusy ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span>Panel de control</span>
            <h1>{section}</h1>
          </div>
          <div className="admin-user">
            <span>{initials.toUpperCase()}</span>
            <div><strong>{adminName}</strong><small>{roleLabel}</small></div>
          </div>
        </header>

        {dataError && (
          <div className="admin-alert" role="alert">
            <span>{dataError}</span>
            <button type="button" onClick={() => refreshAdminData()} disabled={dataBusy}>
              Reintentar
            </button>
          </div>
        )}

        {dataBusy && !localProducts.length ? (
          <section className="admin-panel admin-data-loading" role="status">
            <span className="loading-mark" />
            <p>Cargando información real del negocio…</p>
          </section>
        ) : (
          <>
            {section === "Resumen" && (
              <>
                <section className="admin-metrics">
                  <article><span><Icon name="box" size={22} /></span><div><small>Productos</small><strong>{stats?.activeProducts ?? 0}</strong><em>Catálogo activo</em></div></article>
                  <article><span><Icon name="category" size={22} /></span><div><small>Solo cotización</small><strong>{stats?.quoteOnlyProducts ?? 0}</strong><em>Sin precio publicado</em></div></article>
                  <article><span><Icon name="quote" size={22} /></span><div><small>Cotizaciones nuevas</small><strong>{stats?.newQuotes ?? 0}</strong><em>Requieren atención</em></div></article>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><h2>Productos recientes</h2><p>Últimas referencias devueltas por la base de datos.</p></div><button type="button" onClick={() => setSection("Productos")}>Ver catálogo</button></div>
                  <AdminProductTable
                    products={localProducts.slice(0, 7)}
                    onToggle={toggleProduct}
                    updatingProductId={updatingProductId}
                  />
                </section>
              </>
            )}

            {section === "Productos" && (
              <section className="admin-panel admin-products-panel">
                <div className="admin-panel-heading">
                  <div><h2>Gestión de productos</h2><p>Consulta y organiza las referencias persistidas.</p></div>
                  <button type="button" className="admin-primary-button" onClick={() => {
                    setCreateError("");
                    setShowCreate(true);
                  }}>
                    <Icon name="plus" size={18} />
                    Nuevo producto
                  </button>
                </div>
                <div className="admin-search">
                  <Icon name="search" size={20} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por producto, marca o código" aria-label="Buscar productos" />
                </div>
                <AdminProductTable
                  products={visibleProducts}
                  onToggle={toggleProduct}
                  updatingProductId={updatingProductId}
                />
              </section>
            )}

            {section === "Categorías" && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><h2>Categorías del catálogo</h2><p>Distribución de las referencias de la base de datos.</p></div></div>
                <div className="admin-category-grid">
                  {categories.map((category) => (
                    <article key={category}>
                      <span><Icon name="category" size={21} /></span>
                      <div><strong>{category}</strong><small>{localProducts.filter((product) => product.category === category).length} productos</small></div>
                      <Icon name="chevron" size={18} />
                    </article>
                  ))}
                </div>
              </section>
            )}

            {section === "Cotizaciones" && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><h2>Solicitudes de cotización</h2><p>Consultas registradas desde la web.</p></div></div>
                {quotes.length ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-quotes-table">
                      <thead>
                        <tr>
                          <th>Solicitud</th>
                          <th>Cliente</th>
                          <th>Contacto</th>
                          <th>Detalle</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.map((quote) => (
                          <tr key={quote.id}>
                            <td>
                              <strong>{quote.requestNumber}</strong>
                              <small>
                                {quote.createdAt
                                  ? new Intl.DateTimeFormat("es-PE", {
                                      dateStyle: "medium",
                                    }).format(new Date(quote.createdAt))
                                  : "Sin fecha"}
                              </small>
                            </td>
                            <td>
                              <strong>{quote.contactName}</strong>
                              <small>{quote.companyName || "Cliente particular"}</small>
                            </td>
                            <td>
                              <a href={`tel:${quote.contactPhone}`}>{quote.contactPhone}</a>
                              <small>{quote.contactEmail || "Sin correo"}</small>
                            </td>
                            <td>
                              <span className="admin-quote-message">
                                {quote.message || "Sin mensaje adicional"}
                              </span>
                              <small>{quote.items?.length || 0} productos asociados</small>
                            </td>
                            <td>
                              <label className="sr-only" htmlFor={`quote-status-${quote.id}`}>
                                Estado de {quote.requestNumber}
                              </label>
                              <select
                                id={`quote-status-${quote.id}`}
                                className={`admin-quote-status status-${quote.status}`}
                                value={quote.status}
                                disabled={updatingQuoteId === quote.id}
                                onChange={(event) =>
                                  changeQuoteStatus(quote, event.target.value)
                                }
                              >
                                {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-empty"><Icon name="quote" size={34} /><h3>No hay solicitudes registradas</h3><p>Las nuevas consultas aparecerán aquí después de guardarse en la base de datos.</p></div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {showCreate && (
        <div className="admin-modal-backdrop" onMouseDown={() => {
          if (!createBusy) setShowCreate(false);
        }}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="new-product-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setShowCreate(false)} aria-label="Cerrar" disabled={createBusy}><Icon name="close" size={22} /></button>
            <h2 id="new-product-title">Nuevo producto</h2>
            <p>Registra una referencia disponible para cotización.</p>
            <form onSubmit={createProduct}>
              <label>Nombre del producto<input name="name" required maxLength="240" /></label>
              <div className="form-grid">
                <label>Código<input name="sku" required maxLength="100" /></label>
                <label>Marca<input name="brand" maxLength="120" /></label>
              </div>
              <label>
                Tipo de producto
                <select name="family" defaultValue="">
                  <option value="">Detectar por nombre</option>
                  {productFamilies.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label>
                Categoría de origen
                <select name="categoryId" defaultValue="">
                  <option value="">Sin categoría</option>
                  {adminCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              {createError && <p className="form-error" role="alert">{createError}</p>}
              <button type="submit" className="button button-primary" disabled={createBusy}>
                {createBusy ? "Guardando…" : "Guardar producto"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function AdminProductTable({ products, onToggle, updatingProductId }) {
  if (!products.length) {
    return (
      <div className="admin-empty admin-empty-compact">
        <Icon name="box" size={30} />
        <h3>No se encontraron productos</h3>
        <p>Prueba con otro término de búsqueda.</p>
      </div>
    );
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-products-table">
        <thead><tr><th>Producto</th><th>Marca</th><th>Tipo de producto</th><th>Venta</th><th>Estado</th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td><SmartImage src={product.image} fallback={productFallbackImage(product)} alt="" /><div><strong>{product.name}</strong><small>{product.sku}</small></div></td>
              <td data-label="Marca">{product.brand}</td>
              <td data-label="Tipo de producto">{familyById.get(product.familyId)?.label}</td>
              <td data-label="Venta"><span className="admin-sale-mode">{product.saleMode === "direct" ? "Venta directa" : "Cotización"}</span></td>
              <td data-label="Estado">
                <button
                  type="button"
                  className={`status-toggle ${product.active === false ? "" : "is-active"}`}
                  onClick={() => onToggle(product)}
                  disabled={updatingProductId === product.id}
                >
                  <span />
                  {updatingProductId === product.id
                    ? "Guardando…"
                    : product.active === false
                      ? "Inactivo"
                      : "Activo"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Footer({ navigate }) {
  return (
    <>
      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-about">
            <Brand />
            <p>
              Mantenimiento y ventas de radiadores para buses y camiones.
            </p>
            <div className="footer-contact-links">
              <a href={makeWhatsAppUrl()} target="_blank" rel="noreferrer">
                <Icon name="whatsapp" size={20} />
                Atención por WhatsApp
              </a>
              <a href={WEBSITE}>radiadoresclau.com</a>
              <a href="https://www.facebook.com/people/Radiadores-Clau-SAC/61563858691787/" target="_blank" rel="noreferrer">Facebook de Radiadores Clau</a>
            </div>
          </div>
          <nav className="footer-links" aria-label="Productos">
            <h2>Productos</h2>
            <Link to="/store/?tipo=radiadores" navigate={navigate}>Radiadores</Link>
            <Link to="/store/?tipo=intercoolers" navigate={navigate}>Intercoolers</Link>
            <Link to="/store/?tipo=enfriadores" navigate={navigate}>Enfriadores</Link>
            <Link to="/store/?tipo=condensadores" navigate={navigate}>Condensadores</Link>
          </nav>
          <nav className="footer-links" aria-label="Empresa">
            <h2>Empresa</h2>
            <Link to="/" navigate={navigate}>Inicio</Link>
            <Link to="/store/" navigate={navigate}>Productos</Link>
            <Link to="/nosotros/" navigate={navigate}>Nosotros</Link>
            <Link to="/contacto/" navigate={navigate}>Contacto</Link>
          </nav>
          <section className="footer-location" aria-labelledby="footer-location-title">
            <div className="footer-location-heading">
              <div>
                <span className="footer-location-kicker">Visítanos</span>
                <h2 id="footer-location-title">Ubicación</h2>
              </div>
              <a
                href={BUSINESS_DIRECTIONS}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-directions"
              >
                <Icon name="pin" size={16} />
                Cómo llegar
              </a>
            </div>
            <div className="footer-map">
              <iframe
                title={BUSINESS_ADDRESS}
                src={BUSINESS_MAP_EMBED}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <address className="footer-location-details">
              <a
                href={BUSINESS_DIRECTIONS}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-address"
              >
                <Icon name="pin" size={18} />
                <span>{BUSINESS_ADDRESS}</span>
              </a>
              <div className="footer-location-meta">
                <a href={`tel:${PHONE}`}><Icon name="phone" size={16} />{DISPLAY_PHONE}</a>
              </div>
            </address>
          </section>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Radiadores Clau S.A.C.</span>
          <Link to="/admin/" navigate={navigate}>Administración</Link>
        </div>
      </footer>
    </>
  );
}

function FloatingWhatsApp() {
  return (
    <a
      href={makeWhatsAppUrl()}
      target="_blank"
      rel="noreferrer"
      className="floating-whatsapp"
      aria-label="Contactar por WhatsApp"
    >
      <Icon name="whatsapp" size={35} strokeWidth={1.7} />
    </a>
  );
}

function LoadingCatalog() {
  return (
    <main className="loading-screen">
      <div className="loading-mark" />
      <p>Cargando catálogo especializado…</p>
    </main>
  );
}

function NotFoundPage({ navigate }) {
  return (
    <main className="page-shell not-found">
      <span>404</span>
      <h1>Esta página no está disponible</h1>
      <p>La dirección pudo cambiar. Puedes volver al inicio o explorar el catálogo.</p>
      <div>
        <Link to="/" navigate={navigate} className="button button-secondary">Ir al inicio</Link>
        <Link to="/store/" navigate={navigate} className="button button-primary">Ver productos</Link>
      </div>
    </main>
  );
}

export function App() {
  const { route, pathname, navigate } = useRoute();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(readStoredCart);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    loadProducts(controller.signal)
      .then((catalog) => {
        if (active) setProducts(catalog);
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setProducts(FALLBACK_PRODUCTS.map(normalizeProduct));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("radiadores-clau-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const labels = {
      "/": "Radiadores Clau S.A.C. | Radiadores para buses y camiones",
      "/store/": "Productos | Radiadores Clau S.A.C.",
      "/nosotros/": "Nosotros | Radiadores Clau S.A.C.",
      "/contacto/": "Contacto | Radiadores Clau S.A.C.",
      "/cart/": "Carrito | Radiadores Clau S.A.C.",
      "/my-account/": "Mi cuenta | Radiadores Clau S.A.C.",
      "/recuperar-contrasena/": "Recuperar contraseña | Radiadores Clau S.A.C.",
      "/admin/": "Administración | Radiadores Clau S.A.C.",
    };
    document.title =
      labels[pathname] ||
      (pathname.startsWith("/producto/")
        ? "Producto | Radiadores Clau S.A.C."
        : pathname.startsWith("/categoria-producto/")
          ? "Categoría | Radiadores Clau S.A.C."
          : "Radiadores Clau S.A.C.");
  }, [pathname]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addToCart = (product, quantity = 1) => {
    const directSale =
      product.saleMode === "direct" && Number(product.salePrice ?? product.price) > 0;
    if (!directSale) return;
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...items, { product, quantity }];
    });
    setToast(`${product.name} se agregó al carrito`);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const normalizedPath = pathname.length > 1 && !pathname.endsWith("/") ? `${pathname}/` : pathname;
  const isAdmin = normalizedPath === "/admin/";

  if (loading && !products.length) return <LoadingCatalog />;
  if (isAdmin) return <AdminPage products={products} navigate={navigate} />;

  let page;
  if (normalizedPath === "/" || normalizedPath === "/store/") {
    page = <CatalogPage route={route} products={products} navigate={navigate} onAdd={addToCart} />;
  } else if (normalizedPath.startsWith("/producto/")) {
    const slug = safeDecodePathSegment(normalizedPath.split("/")[2] || "");
    page =
      slug === null ? (
        <NotFoundPage navigate={navigate} />
      ) : (
        <ProductPage
          key={slug}
          product={products.find((product) => product.slug === slug)}
          products={products}
          navigate={navigate}
          onAdd={addToCart}
        />
      );
  } else if (normalizedPath.startsWith("/categoria-producto/")) {
    const slug = safeDecodePathSegment(normalizedPath.split("/")[2] || "");
    page =
      slug === null ? (
        <NotFoundPage navigate={navigate} />
      ) : (
        <CatalogPage
          route={route}
          products={products}
          navigate={navigate}
          onAdd={addToCart}
          legacyCategory={slug}
        />
      );
  } else if (normalizedPath === "/nosotros/") {
    page = <AboutPage navigate={navigate} />;
  } else if (normalizedPath === "/contacto/") {
    page = <ContactPage />;
  } else if (normalizedPath === "/cart/") {
    page = <CartPage cart={cart} setCart={setCart} navigate={navigate} />;
  } else if (normalizedPath === "/my-account/") {
    page = <AccountPage navigate={navigate} />;
  } else if (normalizedPath === "/recuperar-contrasena/") {
    page = <PasswordRecoveryPage navigate={navigate} />;
  } else {
    page = <NotFoundPage navigate={navigate} />;
  }

  return (
    <div className="site">
      <Header products={products} cartCount={cartCount} navigate={navigate} catalog={normalizedPath === "/" || normalizedPath === "/store/" || normalizedPath.startsWith("/categoria-producto/")} />
      {page}
      <Footer navigate={navigate} />
      <FloatingWhatsApp />
      <MobileNavigation path={normalizedPath} navigate={navigate} cartCount={cartCount} />
      <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">
        <Icon name="check" size={19} />
        {toast}
      </div>
    </div>
  );
}
