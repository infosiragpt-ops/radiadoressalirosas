import { useEffect, useState } from "react";
import { formatPrice, productFallbackImage } from "./data.js";
import { cardTitle } from "./productFamilies.js";

export const PHONE = "+51919475144";
export const whatsappLink = (message) =>
  `https://wa.me/${PHONE.slice(1)}?text=${encodeURIComponent(message)}`;

const iconPaths = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.7-4.7" />
    </>
  ),
  cart: (
    <>
      <path d="M3 5h2l1.7 9.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.8 21a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  arrowLeft: <path d="m15 18-6-6 6-6" />,
  arrowRight: <path d="m9 18 6-6-6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  whatsapp: (
    <>
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4.1Z" />
      <path d="M8.2 7.5c.2-.4.4-.4.7-.4h.4c.2 0 .4 0 .5.4l.8 2c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.9-1.1c.2-.2.4-.3.7-.2l2 .9c.3.1.4.3.4.5 0 .3-.2 1.6-1.1 2.2-.8.6-1.8.7-2.4.5-.5-.1-1.3-.3-2.3-.7-2.2-.9-3.7-3-3.8-3.2-.2-.2-1.3-1.8-1.3-3.4 0-1.1.5-1.8.7-2.2Z" />
    </>
  ),
  phone: (
    <path d="M7.2 3.5 10 7.8 8.4 9.6c1.2 2.5 3.3 4.6 5.8 5.8l1.9-1.6 4.3 2.8c.2 2.5-1.2 4.2-3.8 4.4C10 20.1 3.9 14 3 7.3c.2-2.5 1.8-4 4.2-3.8Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m7 7 1 14h8l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  box: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
      <path d="M12 11v10" />
    </>
  ),
  quote: (
    <>
      <path d="M6 8h12a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4 3v-3H6a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z" />
      <path d="M8 12h8M8 15h5" />
    </>
  ),
  category: (
    <>
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <circle cx="7" cy="17" r="3" />
      <circle cx="17" cy="17" r="3" />
    </>
  ),
};

export function Icon({ name, size = 24, strokeWidth = 1.8, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

export function Link({ to, navigate, children, className = "", onClick, ...props }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

export function SmartImage({ src, fallback, alt, className = "", ...props }) {
  const [current, setCurrent] = useState(src || fallback);

  useEffect(() => {
    setCurrent(src || fallback);
  }, [src, fallback]);

  return (
    <img
      {...props}
      className={className}
      src={current}
      alt={alt}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}

export function makeWhatsAppUrl(product, quantity = 1) {
  const text = product
    ? `Hola, deseo cotizar ${quantity > 1 ? `${quantity} unidades de ` : ""}${product.name} (código ${product.sku}). ¿Podrían confirmar disponibilidad y compatibilidad?`
    : "Hola, deseo recibir asesoría para encontrar el repuesto correcto para mi vehículo.";
  return whatsappLink(text);
}

export function ProductCard({ product, navigate, onAdd }) {
  const directSale =
    product.saleMode === "direct" && Number(product.salePrice ?? product.price) > 0;

  return (
    <article className="product-card">
      <Link to={`/producto/${product.slug}`} navigate={navigate} className="product-media" aria-label={product.name}>

        <SmartImage
          src={product.image}
          fallback={productFallbackImage(product)}
          alt={product.name}
          loading="lazy"
        />
      </Link>
      <div className="product-card-copy">
        <Link
          to={`/store/?marca=${encodeURIComponent(product.brand)}`}
          navigate={navigate}
          className="product-category"
        >
          {product.brand}
        </Link>
        <h3>
          <Link to={`/producto/${product.slug}`} navigate={navigate}>
            {cardTitle(product)}
          </Link>
        </h3>
        <div className="product-code" title={product.sku}>Código {product.sku}</div>
        <div className="product-card-footer">
          {directSale && <span className="product-price">{formatPrice(product)}</span>}
          {directSale ? (
            <button type="button" className="small-cart-button" onClick={() => onAdd(product)}>
              <Icon name="cart" size={18} />
              Agregar
            </button>
          ) : (
            <a
              href={makeWhatsAppUrl(product)}
              target="_blank"
              rel="noreferrer"
              className="read-more"
              aria-label={`Cotizar ${product.name} por WhatsApp`}
            >
              <Icon name="whatsapp" size={18} />
              Cotizar
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
