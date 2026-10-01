# NEXO Stock

API y panel de inventario para NEXO Móviles. Node.js ESM + Express 5 + SQLite (`better-sqlite3`). La base SQLite es la fuente de verdad: el navegador nunca guarda el inventario real ni sus costos.

## Estado actual

- Catálogo inicial de iPhone y accesorios con **stock cero**, sin clientes, compras, ventas, costos, movimientos ni IMEI inventados.
- Moneda principal **USD** y ubicación inicial **Córdoba Capital**. No hay conversión automática; el formato de importes es `US$ 1,299.00`.
- Productos padre (`products`) y variantes independientes (`product_variants`); cada variante tiene SKU, stock, costo, precio, promoción, IMEI y estado propios.
- Ventas, compras, entradas, salidas, devoluciones, anulaciones, transferencias, conciliaciones e integración de e-commerce dentro de transacciones SQLite.
- Historial de clientes y filtros por rol en backend.
- Web pública en `/public`, alimentada por el mismo stock y precio de venta que el panel; muestra las variantes publicadas y usa **“Consultar”** cuando todavía no hay precio registrado, sin inventar importes. Las imágenes se sirven desde `/public-assets` y su origen queda registrado: `public-assets/store/manifest.json` (fotos del local) y `public-assets/catalog/manifest.json` (Wikimedia Commons, con autor y licencia).
- Backup/restore JSON validado en una base staging y aplicado de forma atómica.
- Auditoría de operaciones y registro de errores.

## Instalación

```bash
copy .env.example .env       # Linux/macOS: cp .env.example .env
npm install
npm run db:init
npm run dev
```

La API queda en `http://localhost:3000`. En equipos donde `better-sqlite3` no tenga binario precompilado pueden hacer falta Python, `make` y un compilador C++ durante `npm install`.

### Variables principales

| Variable | Default | Uso |
|---|---:|---|
| `DATA_DIR` | `./data` | Directorio persistente |
| `DB_PATH` | `$DATA_DIR/nexo.sqlite` | Ruta de la base; tiene prioridad |
| `PORT` | `3000` | Puerto HTTP |
| `TRUST_PROXY` | `0` | Cantidad exacta de proxies confiados |
| `COOKIE_SECURE` | `true` en producción | Obliga cookie por HTTPS |
| `COOKIE_NAME` | `nexo_session` | Nombre de cookie |
| `LOGIN_RATE_LIMIT` | `10` | Intentos por IP cada 15 minutos |
| `BCRYPT_ROUNDS` | `12` | Rounds bcrypt (10–14) |
| `SEED_DEMO` | `false` | Sólo desarrollo/test; nunca producción |
| `COMMERCE_API_KEY_ID` | vacío | Identificador del servicio de e-commerce |
| `COMMERCE_API_SECRET` | vacío | Secreto HMAC de la integración |

`SEED_DEMO` sólo puede habilitarse explícitamente en desarrollo/test. En producción el arranque sin usuarios crea roles y configuración de sistema, no datos de actividad; el primer administrador se crea con `npm run admin:create`.

## Scripts

```bash
npm run dev       # node --watch server/index.js
npm start         # proceso de ejecución
npm run db:init   # crea/inicializa la base
npm test          # node:test + supertest, sin tocar la base activa
```

Los tests fijan `DATA_DIR` y `DB_PATH` antes de importar el servidor. `createDatabase(path, options)` permite `seed: false` y `bootstrap: false` para staging de restore.

## Arquitectura

```text
db/schema.sql                    Esquema SQLite v3, FKs, checks, índices y triggers
server/app.js                    Factory Express; no abre SQLite al importarse
server/index.js                  Bootstrap, shutdown y barridos de expiración
server/db/database.js            PRAGMAs, creación y migración
server/db/seed.js                Seed sin actividad ficticia
server/db/migrations.js          Migración de bases legacy a v3
server/db/bootstrap.js           Mapeo SQLite → shape de la UI y filtrado por rol
server/db/restore.js             Staging, validación y restore atómico
server/auth.js                   Cookies HttpOnly, sesiones y autorización
server/routes/                   Rutas HTTP finas por dominio
server/services/                 Reglas de negocio transaccionales
server/validation.js             Validación y normalización de entrada
js/store.js                      Cliente API y estado del panel
js/app.js                        Panel, ventas, inventario, clientes y configuración
public.html + js/public.js       Catálogo público
tests/                          Integración de API y de comercio electrónico
```

`products` representa el concepto de modelo y `product_variants` cada SKU. El `id` de una variante es el `product.id` que consume la UI; `productId` expone el producto conceptual interno. `migrateDatabase` reconstruye, cuando sea necesario, las tablas legacy cuyos checks obligaban a tener precio/costo mayores que cero; la migración preserva filas y deja el esquema en v3.

## Roles

| Capacidad | Administrador | Vendedor | Inventario |
|---|:---:|:---:|:---:|
| Bootstrap/consulta de catálogo | Sí | Sí | Sí |
| Crear/editar/archivar producto | Sí | No | No |
| Entrada/salida de stock | Sí | No | Sí |
| Ventas | Sí | Sí | No |
| Compras/proveedores | Sí | No | Sí |
| Clientes | Sí | Sí | No |
| Reservas | Sí | Sí | Sí |
| Usuarios/settings/opciones | Sí | No | No |
| Backup/restore/conciliación | Sí | No | No |

Ocultar controles en la UI no reemplaza estos permisos de backend. El Vendedor no recibe costos ni ganancias; Inventario no recibe clientes ni ventas.

## API principal

Todas las rutas salvo health, login, catálogo público e integración requieren sesión.

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/bootstrap`
- `POST|PATCH|DELETE /api/products[/:id]`
- `POST /api/products/:parentId/variants`
- `PATCH /api/products/:id/apple-price`
- `PATCH /api/products/:id/publication`
- `POST /api/products/import`
- `POST /api/stock`, `POST /api/stock/remove`
- `POST /api/sales`
- `POST /api/sales/:id/annul`
- `POST /api/sales/:id/returns`
- `POST /api/purchases`
- `POST /api/customers`, `PATCH /api/customers/:id`, `GET /api/customers/:id/history`
- `POST /api/suppliers`, `PATCH /api/suppliers/:id`
- `POST /api/users`, `PATCH /api/users/:id`
- `PATCH /api/settings`
- `POST|DELETE /api/options[/:id]`
- `POST /api/reservations`, `DELETE /api/reservations/:id`
- `GET|POST /api/admin/inventory-check`
- `GET /api/admin/backup`, `POST /api/admin/backup/restore`
- `POST /api/admin/reset-demo` (deshabilitado en producción; conserva el historial, no crea actividad)
- `GET /api/public/catalog`

Las mutaciones responden `{ "data": ..., "state": ... }`. `GET /api/bootstrap` devuelve `version`, `settings`, `users`, `suppliers`, `customers`, `products`, `productGroups`, `units`, `sales`, `returns`, `purchases`, `movements`, `reservations`, `warrantyClaims`, `auditLogs`, `errorLogs`, catálogos y `models`.

### Integración de e-commerce

El directorio `ecommerce/` y sus rutas de integración se conservan. La API privada expone catálogo firmado, reservas de stock, confirmación, liberación y cancelación bajo `/api/integrations/store`. Las reservas también descontan `inventory.reserved_quantity`; una venta normal nunca consume unidades reservadas. Los webhooks usan HMAC, timestamp y nonce antireplay.

## Stock, precios y ventas

```json
// POST /api/stock, producto con IMEI
{
  "productId": "variant_id",
  "quantity": 1,
  "unitCost": 1380,
  "imeis": ["490154203237518"],
  "location": "Córdoba Capital"
}
```

```json
// POST /api/sales
{
  "customerId": "customer_id",
  "paymentMethod": "Efectivo",
  "discount": 10,
  "items": [
    { "productId": "variant_id", "quantity": 2, "price": 1299, "discount": 50 }
  ]
}
```

El subtotal de una venta es la suma neta de sus líneas y el descuento de cabecera se aplica una sola vez. Un SKU con IMEI exige `quantity: 1` y una unidad disponible. No se permite vender una unidad reservada. Ventas y compras aceptan `Idempotency-Key`: repetirla con el mismo payload devuelve la operación existente; reutilizarla con otro payload devuelve `409`.

El precio oficial Apple es un dato opcional y editable (`apple_official_price_usd`, fuente y fecha); no se hardcodea ni se usa como precio de venta. `sale_price`, `promo_price`, `cost` y sus flags `*_registered` distinguen “sin registrar” de cero real.

## Backup y restore

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@nexo.com","password":"..."}' \
  http://localhost:3000/api/auth/login

curl -b cookies.txt -o nexo-backup.json http://localhost:3000/api/admin/backup

curl -b cookies.txt -H 'Content-Type: application/json' \
  --data-binary @nexo-backup.json \
  http://localhost:3000/api/admin/backup/restore
```

El export incluye `app`, `format`, `version`, `metadata` y `data` con el estado completo. Restore valida shape, límites, FKs, IMEIs, totales, unidades serializadas, reservas, publicación y `integrity_check` en una base staging. Luego reemplaza el dominio en una transacción, conserva usuarios/roles/contraseñas y mantiene válida la sesión activa. Las reservas de comercio se limpian porque no forman parte del backup JSON.

## Invariantes y pruebas

- `inventory.quantity >= 0` y `0 <= reserved_quantity <= quantity` por check SQLite.
- Cada descuento de stock es condicional y la operación completa está en una transacción.
- IMEI e IMEI secundario son únicos incluso cruzando ambas columnas; Luhn se valida en API y restore.
- Una unidad serializada sólo puede estar en una venta y una reserva activa a la vez.
- Anulación y devoluciones calculan la reposición sobre lo ya devuelto, evitando duplicar stock.
- Producto, opción y reserva no se borran físicamente: se archivan, desactivan o cancelan.
- `audit_logs` redacta contraseñas, hashes, tokens y secretos; `error_logs` registra fallos 5xx.

```bash
npm test
```

43 pruebas. Las que fijan invariantes del negocio son `oversell.test.js` (el
carrito nunca supera el stock disponible) y `quote-stability.test.js` (la
huella de la cotización sólo cambia cuando cambia el precio, no en cada
consulta). La suite cubre además:

| Archivo | Qué fija |
|---|---|
| `api.test.js` | Login, roles, variantes, ventas, anulaciones, IMEI, backup/restore |
| `commerce-safety.test.js` | Lo ficticio nunca llega al catálogo público ni a producción |
| `oversell.test.js` | El carrito rechaza superar el stock real |
| `quote-stability.test.js` | La huella de precio es estable y el cliente puede comprar sin marcar la casilla |
| `acceptance.test.js` | Los doce escenarios de compra de punta a punta entre los dos sistemas |
| `public-catalog.test.js` | `/api/public/catalog` publica precio y stock reales, sin datos internos |
| `commerce.integration.test.js` | Catálogo, reservas y confirmación con firma HMAC |
| `storefront.integration.test.js` | Checkout completo entre ambos procesos |

## E-commerce independiente

La tienda vive en [`ecommerce/`](ecommerce/README.md) y corre en `:4000`. No duplica catálogo ni stock: consume la API firmada `/api/integrations/store`, reserva stock y confirma ventas contra esta base. Sus credenciales, pagos, dominio y datos de contacto son configuración externa; no se presentan como activos hasta cargarlos.

## Desarrollo con datos de prueba

Para revisar la tienda sin inventario real hay una pila separada que **no toca la base de producción**:

```bash
npm run dev:seed    # crea el catálogo MOCK en data/nexo-dev.sqlite
npm run dev:stack   # stock en :3100 y tienda en :4100
```

- `data/nexo-dev.sqlite` y `ecommerce/data/nexo-store-dev.sqlite` son bases de desarrollo; `data/nexo.sqlite` queda intacta.
- Toda fila del fixture lleva `is_fictional = 1`. La API de e-commerce excluye lo ficticio salvo que se habilite `COMMERCE_INCLUDE_FICTIONAL`, y `getConfig()` rechaza esa variable cuando `NODE_ENV=production`.
- `npm run dev:seed -- --reset` borra únicamente lo marcado como ficticio.
- El panel de la tienda de desarrollo queda en `http://localhost:4100/admin` (`dev-admin@nexo.local`). Es una credencial fija de desarrollo; en producción se crea con `npm run admin:create`.
- El fixture no crea clientes, ventas, compras ni ganancias: sólo catálogo con stock y precios ficticios.



1. Cambiar las credenciales de acceso iniciales y deshabilitar cuentas no utilizadas.
2. Requerir HTTPS y `COOKIE_SECURE=true`; configurar `TRUST_PROXY` según la topología real.
3. Mantener `data/` sólo en un volume privado y realizar backups verificados.
4. No publicar `server/`, `db/`, SQLite o WAL como estáticos.
5. Configurar secretos de e-commerce y webhooks sólo si la tienda los utiliza.
6. Hacer backup antes de aplicar una futura migración de esquema.
