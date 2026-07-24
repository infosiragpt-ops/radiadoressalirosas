# Base de datos

Las migraciones son incrementales y se verifican por checksum. No edite una
migración ya aplicada: agregue la siguiente (`002_...sql`).

```bash
npm --prefix packages/db install
DATABASE_URL=postgresql://... npm --prefix packages/db run migrate
DATABASE_URL=postgresql://... npm --prefix packages/db run seed
```

El seed lee `data/catalog.json` de forma idempotente cuando el archivo existe.
También puede recibir otra ruta con `CATALOG_PATH`. Un administrador inicial
solo se crea si se proporcionan conjuntamente `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FIRST_NAME` y `SEED_ADMIN_LAST_NAME`.

## Separación de privilegios

En producción, `MIGRATOR_DATABASE_URL` debe pertenecer al propietario del
esquema y `DATABASE_URL` a una cuenta de runtime sin privilegios DDL. El
provisionamiento se mantiene como una acción explícita para no crear usuarios
ni cambiar contraseñas sin autorización:

```bash
psql "$MIGRATOR_DATABASE_URL" \
  -v runtime_role=radiadores_app \
  -v runtime_password='GENERE_UN_SECRETO_REAL' \
  -v database_name=radiadores_salirosas \
  -f packages/db/scripts/provision-runtime-role.sql
```

Después, configure `DATABASE_URL` con `radiadores_app`. El script concede solo
conexión, uso de esquema y DML sobre tablas/secuencias; revoca creación de
objetos y fuerza `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
`NOREPLICATION` y `NOBYPASSRLS`.
