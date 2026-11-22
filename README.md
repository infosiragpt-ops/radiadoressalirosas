# Radiadores Clau S.A.C.

Catálogo, cotizaciones y administración para el mantenimiento y la venta de radiadores para buses y camiones, con React, Fastify y PostgreSQL. El dominio de producción es `https://radiadoresclau.com`.

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

## Producción en el VPS de Hostinger

Use Docker Compose y una base de datos dedicada a esta aplicación. En el directorio de la versión desplegada, cree un `.env` con permisos `600`. Use nombres y secretos propios para el propietario de PostgreSQL, la cuenta limitada de la API y las sesiones. Las dos URL de PostgreSQL usan el host interno `postgres`.

Para la primera instalación, seleccione puertos libres en el VPS y genere los secretos **en el servidor**. Este ejemplo requiere Bash, OpenSSL y que el directorio todavía no contenga un archivo `.env`.

```bash
(
  set -eu
  umask 077
  set -o noclobber
  owner_password=$(openssl rand -hex 32)
  runtime_password=$(openssl rand -hex 32)
  cat > .env <<EOF
COMPOSE_PROJECT_NAME=radiadores-clau
POSTGRES_DB=radiadores_clau
POSTGRES_USER=clau_owner
POSTGRES_PASSWORD=$owner_password
RUNTIME_ROLE=clau_app
RUNTIME_PASSWORD=$runtime_password
MIGRATOR_DATABASE_URL=postgresql://clau_owner:$owner_password@postgres:5432/radiadores_clau
DATABASE_URL=postgresql://clau_app:$runtime_password@postgres:5432/radiadores_clau
SESSION_SECRET=$(openssl rand -hex 48)
CORS_ORIGINS=https://radiadoresclau.com,https://www.radiadoresclau.com
TRUST_PROXY=true
API_BIND_ADDRESS=127.0.0.1
API_PORT=4000
WEB_PORT=8080
EOF
)
```

Después de ajustar los puertos, inicie PostgreSQL, ejecute las migraciones, conceda permisos a la cuenta limitada y cargue el catálogo de la primera instalación.

```bash
set -a
. ./.env
set +a
docker compose up -d --wait postgres
docker compose --profile ops run --build --rm migrate
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v database_name="$POSTGRES_DB" -v runtime_role="$RUNTIME_ROLE" \
  -v runtime_password="$RUNTIME_PASSWORD" < packages/db/scripts/provision-runtime-role.sql
docker compose --profile bootstrap run --build --rm seed
docker compose up -d --build --wait web
curl --fail "http://127.0.0.1:$WEB_PORT/api/v1/health"
```

Para actualizar una instalación existente, conserve el archivo de entorno y el volumen del proyecto. Respalde la base de datos, ejecute la tarea `migrate` y actualice `web` y `api` con Compose. El seed es exclusivo de la primera importación porque puede sobrescribir cambios del catálogo.

En el proxy HTTPS del VPS, enrute los dos nombres del sitio hacia `127.0.0.1:$WEB_PORT`, y establezca `Host`, `X-Real-IP` y `X-Forwarded-Proto` con los valores del proxy. Verifique el sitio y la API contra el VPS. A continuación, dirija el registro A de `radiadoresclau.com` al VPS, compruebe que `www` apunta al mismo sitio y active el certificado de ambos nombres. Compruebe desde una conexión externa la portada, el catálogo y `/api/v1/health` por HTTPS.

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
- `docker-compose.yml` ofrece la web, la API y PostgreSQL con puertos locales para el proxy del VPS.

Consulta [apps/api/README.md](apps/api/README.md) para el contrato de rutas y
[reference/source-capture.md](reference/source-capture.md) para la trazabilidad
del sitio de referencia.
