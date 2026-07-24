# Catálogo de Radiadores Salirosas

`catalog.json` es una instantánea determinista del catálogo público de
`https://radiadoressalirosas.com`, obtenida el 24 de julio de 2026 desde:

- WooCommerce Store API v1: productos, categorías, precios, disponibilidad y destacados.
- WordPress REST API: verificación del estado público `publish`.
- `reference/assets/original/manifest.json`: banners, logotipos, medios de pago y las
  imágenes de producto ya capturadas en la referencia visual.

La instantánea contiene **186 productos**, **11 categorías** y **10 productos
destacados**, ordenados por identificador para que el archivo sea estable entre
ejecuciones. Los nombres y SKU tienen sus entidades HTML decodificadas; los `slug`
se normalizan de forma determinista para conservar URLs locales legibles y estables.
El SHA-256 de esta versión es
`35d9816b86c15ccc68fe44361b57c54e903d0176cf98abc878d255bec74e10b4`.

Todas las imágenes de producto se sirven localmente desde
`/assets/original/products/`. `image.originalUrl` conserva la procedencia y
`image.localPath` es la ruta que debe usar la aplicación. No se requieren hotlinks
en tiempo de ejecución. La copia publicada para el frontend está en
`apps/web/public/data/catalog.json`.

La tienda original publica todos los precios como `0 PEN`, marca los 186 productos
como disponibles (etiqueta `10 disponibles`) y no permite compra directa; esos
valores se preservan sin inventar precios comerciales.
