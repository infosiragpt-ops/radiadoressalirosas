# Radiadores Salirosas — source capture

Captured on 2026-07-24 from `https://radiadoressalirosas.com/`.

## Visual truth

- Desktop first viewport supplied by the user:
  `reference/source/desktop/user-home-3022x1718.png`
- Mobile first viewport at `390 × 844`:
  `reference/source/mobile/home-top-390x844.png`
- Mobile carousel states and scroll checkpoints:
  `reference/source/mobile/home-step-1-900.png`,
  `reference/source/mobile/home-step-2-1800.png`,
  `reference/source/mobile/home-step-3-2700.png`,
  `reference/source/mobile/home-step-4-2846.png`
- Browser asset inventory and local bundle:
  `reference/assets/original/manifest.json`

The browser inventory contains 130 downloaded images, fonts, and stylesheets with
zero download failures. The original DOM was inspected at desktop and mobile
breakpoints.

The mobile slideshow settings exposed two lazy background assets that were not
present in the first desktop asset bundle. They were captured directly from the
source URLs and stored locally as
`hero-mobile-radiadores-europeos.jpg` (SHA-256
`b4363663a7b45a97374d5fd48932d586df1d67bce2307af22a965ccdaf09bd5b`) and
`hero-mobile-envios.jpg` (SHA-256
`65d6ee59957758ac0fa030582c4f364e09c0ed85c966fb1140133f625555582e`).

## Public routes and states inspected

- `/`: desktop and mobile header, desktop and mobile carousel, three promotional
  cards, featured products, new arrivals, payment strip, footer, and WhatsApp.
- `/store/`: sidebar search, 11 vehicle brands, best sellers, sort menu,
  12-product grid, result count, and pagination.
- `/producto/radiador-man-truck-tga-765-x-938-x-40-81061016518/`: gallery,
  title, SKU, brand, reviews form, and related products.
- `/cart/`: empty-cart state.
- `/my-account/` and `/my-account/lost-password/`: login and recovery states.
- `/nosotros/` and `/contacto/`: corporate content, contact details, and map.
- Header search: input and AJAX result behavior.
- Mobile navigation: collapsed header and menu trigger.

## Functional truth

- The public WooCommerce Store API exposes 186 products and 11 brand categories.
- All public products currently report a zero price, are not purchasable, and are
  marked in stock.
- The original site therefore behaves as a technical catalogue and routes
  commercial intent to WhatsApp instead of completing checkout.
- The replica keeps catalogue-first behavior while adding an admin-selectable
  `QUOTE_ONLY` or `DIRECT` sale mode.
- Public commercial phone/WhatsApp: `+51 943 716 278`.

## Known source defects intentionally not copied

- Test/sample WordPress routes.
- Broken encoding in a small number of product names.
- Account icon incorrectly linking to the home page.
- Mixed-language empty checkout copy.
- Product review submission without moderation controls.
- Sitemap omission of product and brand routes.
