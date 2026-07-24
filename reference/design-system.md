# Radiadores Salirosas — implementation design system

## Source and intent

This is a faithful code implementation of the captured site. It preserves the
recognizable commercial skeleton and imagery while replacing WordPress/WooCommerce
internals with a maintainable React, API, and PostgreSQL implementation.

## Allowed above-the-fold copy

Desktop:

- `Buscar productos ...`
- `INICIO`
- `PRODUCTOS`
- `NOSOTROS`
- `CONTACTO`
- The carousel copy embedded in the original hero images.

Mobile:

- No search field in the first row.
- Logo, cart count, and menu control.
- The carousel copy embedded in the original mobile hero images.

No additional hero eyebrow, badge, CTA, subtitle, or marketing sentence is allowed.

## Tokens

```css
--brand-orange: #ee7225;
--brand-orange-strong: #eb5d00;
--ink: #111111;
--ink-soft: #333333;
--muted: #777777;
--line: #eeeeee;
--canvas: #ffffff;
--surface-soft: #f5f7f9;
--footer: #2f2f2f;
--whatsapp: #25d366;
--shadow-soft: 0 10px 28px rgb(0 0 0 / 12%);
--radius-media: 8px;
--radius-control: 999px;
```

The page canvas is true white. Do not replace it with cream or tinted white.

## Typography

- UI and body: `Helvetica Neue`, Helvetica, Arial, sans-serif.
- Navigation: 15–16 px, weight 700, uppercase.
- Search: 16 px regular.
- Section titles: 32–36 px desktop and 27–30 px mobile, weight 800–900.
- Product brand labels: 13–14 px, muted.
- Product names: 17–19 px, weight 700, tight but readable line height.
- Footer body: 15–16 px, 1.65 line height.

## Desktop layout

- Header height: 82 px.
- Header horizontal padding: 40 px.
- Logo visual width: about 153 px.
- Search: about 495 × 38 px, white, pill radius.
- Header order: logo, search, flexible space, four nav links, cart, account.
- Hero: full-width original image, roughly 3.13:1.
- Promotion rail: three equal columns, 20 px outer padding, 24 px gap,
  approximately 2.75:1 media ratio.
- Product grid: six featured products; catalogue uses three columns beside a
  narrow filter rail.
- Footer: dark four-region desktop layout with logo/copy, navigation, brands,
  and map.

## Mobile layout

- Target viewport: 390 × 844 CSS px.
- Header height: about 64 px; logo left, cart and menu right.
- Search and desktop navigation are hidden behind the menu.
- Mobile carousel uses the dedicated portrait source images; desktop hero
  imagery must never be squeezed into the mobile slot.
- Promotions stack one per row with 20 px side gutters.
- Product cards form one column on narrow screens and two columns where space
  permits.
- Floating WhatsApp stays clear of primary actions and bottom content.

## Image treatment

- Hero and promotional assets contain their own text and brand marks. They are
  rendered as images without tint, gradient wash, or overlaid replacement copy.
- Product images use a square white frame with `object-fit: contain`.
- No hotlinked production asset is allowed in the final app.
- Logo, hero, promotions, payments, and product images come from the downloaded
  source bundle or the imported WooCommerce media.

## Component families

- `SiteHeader`: desktop and mobile variants.
- `SearchOverlay`: live results with thumbnail, brand, and product name.
- `HeroCarousel`: desktop and mobile picture sources, timed fade, manual dots,
  reduced-motion support.
- `PromotionRail`: linked original promotional media.
- `ProductCard`: image, brand, title, optional price, quote/direct action.
- `CatalogFilters`: text search, brand, family, and sort.
- `ProductGallery`: square image and lightbox.
- `CartDrawer` / `CartPage`: quantity controls and persistent item count.
- `SiteFooter`: company description, social links, navigation, brands, map.
- `AdminShell`: catalogue, stock, orders, banners, and site settings.

## Core interaction path

1. Search or browse products.
2. Open a product detail.
3. For `QUOTE_ONLY`, create a prefilled WhatsApp enquiry.
4. For `DIRECT`, add to cart and place an order through the API.
5. Admin can change sale mode, stock, catalogue content, and order status.

