import { useMemo, useRef, useState } from "react";
import { familyById, matchesSearch, productFamilies } from "./productFamilies.js";
import { Icon, Link, ProductCard, whatsappLink } from "./shopUI.jsx";

const PAGE_SIZE = 24;
const byName = new Intl.Collator("es-PE", { numeric: true, sensitivity: "base" });
const familyOrder = new Map(productFamilies.map(({ id }, index) => [id, index]));
const sortLabels = { tipo: "Por tipo", nombre: "Nombre A–Z", inverso: "Nombre Z–A", destacados: "Destacados", nuevos: "Nuevos ingresos", marca: "Marca" };

function sortedProducts(products, sort) {
  return products.sort((a, b) => {
    const alphabetical = byName.compare(a.name, b.name) || byName.compare(a.sku, b.sku);
    switch (sort) {
      case "nombre": return alphabetical;
      case "inverso": return -alphabetical;
      case "marca": return byName.compare(a.brand, b.brand) || alphabetical;
      case "destacados": return Number(b.featured) - Number(a.featured) || alphabetical;
      case "nuevos": return Number(b.isNew) - Number(a.isNew)
        || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || alphabetical;
      default: return familyOrder.get(a.familyId) - familyOrder.get(b.familyId) || alphabetical;
    }
  });
}

function FamilyPicker({ products, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const families = useMemo(() => productFamilies.map((family) => {
    const members = products.filter((p) => p.familyId === family.id);
    return { ...family, count: members.length, photo: family.image || members.find((p) => p.image)?.image };
  }).filter((family) => family.image || family.count), [products]);

  const visible = expanded ? families : families.filter((f, i) => i < 3 || selected === f.id);
  return (
    <section className="families" aria-labelledby="families-heading">
      <div className="shop-section-title">
        <h2 id="families-heading">Categorías</h2>
        {families.length > 3 && (
          <button type="button" className="family-disclosure" aria-expanded={expanded} aria-controls="family-choices" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Ver menos" : "Ver todas"} <Icon name="chevron" size={16} />
          </button>
        )}
      </div>
      <div className="family-choices" id="family-choices">
        {visible.map((family) => (
          <button type="button" key={family.id} className="family-choice" aria-pressed={selected === family.id}
            onClick={() => onSelect(selected === family.id ? "" : family.id)}>
            <span className="family-photo">
              {family.photo ? <img src={family.photo} alt="" width="124" height="80" /> : <Icon name="box" size={34} />}
            </span>
            <span>{family.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CatalogSelect({ label, value, onChange, children }) {
  return (
    <label className="catalog-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
      <Icon name="chevron" size={16} />
    </label>
  );
}

function CatalogEmpty({ family, emptyFamily, clear }) {
  const subject = family?.label.toLocaleLowerCase("es");
  return (
    <div className="catalog-empty">
      <Icon name={emptyFamily ? "box" : "search"} size={31} />
      <h3>{emptyFamily ? "Sin referencias publicadas" : "Sin coincidencias"}</h3>
      <p>{emptyFamily
        ? "Consulta con el equipo qué opciones de " + subject + " hay para tu vehículo."
        : "Prueba con otra marca, nombre o código de pieza."}</p>
      {emptyFamily && (
        <a className="catalog-inquiry" target="_blank" rel="noreferrer"
          href={whatsappLink("Hola, quiero consultar medidas y disponibilidad de " + subject + " para mi vehículo.")}>
          <Icon name="whatsapp" size={20} /> Consultar {subject}
        </a>
      )}
      <button className="reset-catalog" onClick={clear} type="button">Ver todos los productos</button>
    </div>
  );
}

export function CatalogPage({ route, products, navigate, onAdd, legacyCategory = "" }) {
  const params = new URL(route, window.location.origin).searchParams;
  const resultHeading = useRef(null);
  const query = params.get("q") || "";
  const familyId = params.get("tipo") || (familyById.has(legacyCategory) ? legacyCategory : "");
  const family = familyById.get(familyId);
  const origin = params.get("categoria") || (familyById.has(legacyCategory) ? "" : legacyCategory);
  const brand = params.get("marca") || "";
  const sort = params.get("orden") || "tipo";
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand))].sort(byName.compare), [products]);
  const filtered = useMemo(() => sortedProducts(products.filter((p) =>
    (!familyId || p.familyId === familyId) && (!origin || p.categorySlug === origin) &&
    (!brand || p.brand === brand) && matchesSearch(p, query)), sort), [products, familyId, origin, brand, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(params.get("pagina"), 10) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const originLabel = products.find((p) => p.categorySlug === origin)?.category || origin;
  const resultLabel = query.trim() ? "Resultados" : family?.label || originLabel || "Productos";

  function changeFilter(changes, options = {}) {
    const next = new URLSearchParams(params);
    if (origin) next.set("categoria", origin);
    if (familyId) next.set("tipo", familyId);
    next.delete("pagina");
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    const search = next.toString();
    navigate("/store/" + (search ? "?" + search : ""), { scroll: false, ...options });
  }

  function focusResults() {
    resultHeading.current?.focus({ preventScroll: true });
    resultHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function changePage(nextPage) {
    changeFilter({ pagina: nextPage === 1 ? "" : String(nextPage) });
    focusResults();
  }

  return (
    <main className="shop-catalog">
      <div className="shop-wrap">
        <div className="catalog-intro">
          <h1>Catálogo de repuestos</h1>
          <form className="catalog-search" role="search" onSubmit={(event) => {
            event.preventDefault();
            focusResults();
          }}>
            <Icon name="search" size={21} />
            <label className="sr-only" htmlFor="catalog-query">Buscar producto, marca o código</label>
            <input id="catalog-query" type="search" enterKeyHint="search" autoComplete="off" maxLength={120}
              value={query} placeholder="Buscar producto, marca o código"
              onChange={(event) => changeFilter({ q: event.target.value }, { replace: Boolean(query) })} />
          </form>
        </div>
        <FamilyPicker products={products} selected={familyId} onSelect={(id) => changeFilter({ tipo: id, categoria: "" })} />
        <section className="shop-results" aria-labelledby="catalog-result-heading">
          <div className="shop-section-title">
            <h2 id="catalog-result-heading" tabIndex={-1} ref={resultHeading}>{resultLabel}</h2>
            <span className="result-count" role="status">{filtered.length} {filtered.length === 1 ? "producto" : "productos"}</span>
          </div>
          <div className="catalog-tools">
            <CatalogSelect label="Filtrar por marca" value={brand} onChange={(value) => changeFilter({ marca: value })}>
              <option value="">Todas las marcas</option>
              {brands.map((name) => <option key={name} value={name}>{name}</option>)}
            </CatalogSelect>
            <CatalogSelect label="Ordenar productos" value={Object.hasOwn(sortLabels, sort) ? sort : "tipo"} onChange={(value) => changeFilter({ orden: value })}>
              {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </CatalogSelect>
            {Boolean(familyId || origin || brand || query) && (
              <button type="button" className="clear-catalog" onClick={() => navigate("/store/", { scroll: false })}>
                <Icon name="close" size={14} /> Limpiar filtros
              </button>
            )}
          </div>
          {shown.length ? (
            <>
              <div className="shop-grid">
                {shown.map((product) => <ProductCard key={product.id} product={product} navigate={navigate} onAdd={onAdd} />)}
              </div>
              {pageCount > 1 && (
                <nav className="catalog-pages" aria-label="Páginas de productos">
                  <button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}><Icon name="arrowLeft" size={18} /> Anterior</button>
                  <span>Página {page} de {pageCount}</span>
                  <button type="button" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Siguiente <Icon name="arrowRight" size={18} /></button>
                </nav>
              )}
            </>
          ) : <CatalogEmpty family={family} emptyFamily={Boolean(family && !products.some((p) => p.familyId === family.id))}
            clear={() => navigate("/store/", { scroll: false })} />}
        </section>
      </div>
    </main>
  );
}

const tabs = [
  { href: "/", label: "Catálogo", icon: "dashboard" },
  { href: "/cart/", label: "Carrito", icon: "cart" },
  { href: "/contacto/", label: "Contacto", icon: "quote" },
  { href: "/my-account/", label: "Mi cuenta", icon: "user" },
];

export function MobileNavigation({ path, navigate, cartCount }) {
  const inCatalog = path === "/" || path === "/store/" || path.startsWith("/producto/") || path.startsWith("/categoria-producto/");
  return (
    <nav className="mobile-tabs" aria-label="Accesos de la aplicación">
      {tabs.map(({ href, label, icon }) => (
        <Link key={href} to={href} navigate={navigate}
          aria-current={(href === "/" ? inCatalog : path === href) ? "page" : undefined}>
          <Icon name={icon} size={22} />
          <span>{label}{href === "/cart/" && cartCount > 0 ? " (" + cartCount + ")" : ""}</span>
        </Link>
      ))}
    </nav>
  );
}
