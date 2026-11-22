# API de Radiadores Clau S.A.C.

Backend HTTP en TypeScript, Fastify y PostgreSQL. El prefijo estable es
`/api/v1`.

## Modelo comercial

Los productos importados son `quote_only` por defecto, incluso si el archivo no
trae ese campo. Solo un producto con `"saleMode": "direct"` **y** precio mayor
que cero puede entrar al carrito o al checkout. Esto evita inventar precios para
el catálogo real.

- `POST /api/v1/quotes` crea una solicitud de cotización sin exigir cuenta.
  Acepta consultas generales sin productos y consultas de producto con hasta
  25 referencias.
- El carrito y el checkout requieren login; no hay carrito anónimo en esta
  versión.
- `POST /api/v1/checkout` acepta `Idempotency-Key` y bloquea inventario dentro
  de una transacción.

## Ejecución local

1. Copie `.env.example` a `.env` y complete todos los secretos.
2. Instale dependencias sin compartir `node_modules` entre paquetes:

   ```bash
   npm --prefix packages/db install
   npm --prefix apps/api install
   ```

3. Levante PostgreSQL y ejecute:

   ```bash
   npm --prefix packages/db run migrate
   npm --prefix packages/db run seed
   npm --prefix apps/api run dev
   ```

Para la primera instalación con Compose, ejecute desde la raíz:

```bash
docker compose up -d postgres
docker compose --profile bootstrap run --rm seed
docker compose up -d --build api
```

El contenedor de API no ejecuta migraciones ni seed al arrancar. Antes de
desplegar una versión con cambios de esquema se ejecuta:

```bash
docker compose --profile ops run --rm migrate
```

`MIGRATOR_DATABASE_URL` corresponde al propietario del esquema y se usa solo en
estas tareas one-shot. `DATABASE_URL` pertenece al runtime y debe usar una
cuenta limitada a las operaciones de la aplicación. En desarrollo ambas pueden
coincidir. El seed se mantiene deliberadamente separado porque actualiza
catálogo, inventario e identidad del administrador; no debe repetirse en cada
restart. Para Compose, ambas URLs deben usar `postgres` como host y las
credenciales deben estar codificadas cuando contengan caracteres reservados.

## Rutas

Públicas:

- `GET /api/v1/health`
- `GET /api/v1/products`
- `GET /api/v1/products/:slug`
- `GET /api/v1/categories`
- `GET /api/v1/settings`
- `POST /api/v1/quotes`

Cuenta:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/cart`
- `POST /api/v1/cart/items`
- `PATCH|DELETE /api/v1/cart/items/:itemId`
- `POST /api/v1/checkout`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:orderId`

Administración (`staff` o `admin`):

- `GET|POST /api/v1/admin/products`
- `PATCH|DELETE /api/v1/admin/products/:productId`
- `GET /api/v1/admin/orders`
- `PATCH /api/v1/admin/orders/:orderId/status`
- `GET /api/v1/admin/quotes`
- `PATCH /api/v1/admin/quotes/:quoteId`
- `GET /api/v1/admin/stats`

Solo `admin` puede modificar `PUT /api/v1/admin/settings/:key`.

## Seguridad operativa

Las contraseñas usan `scrypt`. La cookie es `HttpOnly`, `SameSite=Lax`,
`Secure` en producción y firmada. PostgreSQL conserva únicamente el HMAC del
token de sesión. CORS usa una lista explícita, hay rate limits globales y más
estrictos en login, registro y cotización, validación de entradas, auditoría de
acciones administrativas y respuestas de error sin trazas.

No existen credenciales por defecto. El seed crea un administrador únicamente
si recibe las cuatro variables `SEED_ADMIN_*`.
