# Radiadores Salirosas

Implementación profesional en código del catálogo de Radiadores Salirosas.
Conserva la identidad visual y los activos del sitio de referencia, pero
reemplaza WordPress/WooCommerce por una arquitectura React + Fastify +
PostgreSQL.

## Arquitectura

- `apps/web`: React 19 y Vite, responsive, rutas de catálogo, ficha de
  producto, contacto, cuenta y administración.
- `apps/api`: API HTTP en TypeScript/Fastify bajo `/api/v1`.
- `packages/db`: migraciones PostgreSQL con checksum y seed idempotente.
- `data/catalog.json`: captura trazable de 186 productos y 11 categorías.
- `reference`: evidencia visual, inventario de activos y decisiones de diseño.

Los productos importados están en modo `quote_only`: el origen no publica
precios ni habilita compra directa. El sistema nunca convierte esos ceros en
precios ficticios. Un administrador puede habilitar `direct` únicamente junto
con un precio positivo.

## Clonar el proyecto

El repositorio es público y no requiere una cuenta de GitHub para clonarlo:

```bash
git clone https://github.com/infosiragpt-ops/radiadoressalirosas.git
cd radiadoressalirosas
npm ci
cp .env.example .env
```

Después, complete en `.env` la conexión de PostgreSQL y genere
`SESSION_SECRET` con `openssl rand -base64 48`. Continúe con una de las rutas de
ejecución siguientes.

## Ejecución local

Requiere Node.js 22+ y PostgreSQL 16+.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev:api
```

En otra terminal:

```bash
npm run dev:web -- --host 127.0.0.1 --port 4173 --strictPort
```

La web queda en `http://localhost:4173` y la API en
`http://127.0.0.1:4000/api/v1`. Vite reenvía `/api` a la API durante el
desarrollo.

## Bootstrap con Docker

El seed es una operación explícita de primera instalación; nunca se ejecuta
automáticamente al reiniciar la API, porque podría sobrescribir cambios hechos
desde administración.

```bash
docker compose up -d postgres
docker compose --profile bootstrap run --rm seed
docker compose up -d --build api
```

Después del bootstrap, los reinicios habituales usan únicamente
`docker compose up -d`. Antes de desplegar una versión con migraciones nuevas,
ejecute `docker compose --profile ops run --rm migrate`. Vuelva a ejecutar
`seed` solo para una importación deliberada del catálogo y después de respaldar
PostgreSQL.

En una publicación donde frontend y API usen dominios distintos, compile la web
con `VITE_API_BASE_URL=https://api.su-dominio.com/api/v1` y agregue el origen
del frontend a `CORS_ORIGINS`. El valor está documentado en
`apps/web/.env.example`; el desarrollo local sigue usando el proxy de Vite.

## Validación

```bash
npm run check
npm test
```

La validación cubre tipos y build de la API, reglas de dinero y estados de
pedido, hashing de contraseñas, build del frontend y comportamiento de rutas
para empaquetado.

## Seguridad y operación

- Cookies de sesión `HttpOnly`, firmadas y `SameSite=Lax`; `Secure` en
  producción.
- Contraseñas con `scrypt`; PostgreSQL almacena solo el HMAC del token de
  sesión.
- CORS con lista explícita, rate limiting, Zod, transacciones, idempotencia de
  checkout y auditoría administrativa.
- Las credenciales locales se definen solo en `.env`, que está excluido de Git.
- Docker separa `MIGRATOR_DATABASE_URL` (propietario del esquema, usado en
  tareas one-shot) de `DATABASE_URL` (cuenta limitada del runtime).
- `packages/db/scripts/provision-runtime-role.sql` permite crear esa cuenta
  limitada de manera explícita, sin contraseñas incrustadas en el repositorio.
- `docker-compose.yml` ofrece PostgreSQL y API sin credenciales incrustadas.

Consulta [apps/api/README.md](apps/api/README.md) para el contrato de rutas y
[reference/source-capture.md](reference/source-capture.md) para la trazabilidad
del sitio de referencia.
