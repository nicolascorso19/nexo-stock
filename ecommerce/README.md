# NEXO Store

Tienda pública independiente para NEXO. Corre como segundo proceso, en `http://localhost:4000`, y comparte **únicamente datos de catálogo/stock** con el sistema privado mediante API HMAC.

## Separación

- `NEXO Stock` (`:3000`) es la autoridad de productos, variantes, stock, IMEI, costos, compras y ventas.
- `NEXO Store` (`:4000`) tiene su propia SQLite: clientes web, carrito, pedidos, pagos, cupones, contenido, métricas y referencias de reservas.
- El e-commerce nunca escribe tablas de stock, nunca calcula disponibilidad propia y nunca recibe costos, proveedores ni IMEI.
- El checkout pide una reserva temporal al stock privado. La confirmación de pago es la que convierte la reserva en venta.

## Inicio local

Desde la raíz del proyecto:

```powershell
node ecommerce/src/scripts/setup-local.js
npm run admin:create                 # crea el primer usuario de NEXO Stock
INICIAR-NEXO.cmd                     # sistema privado
INICIAR-STORE.cmd                    # tienda
```

`setup-local.js` genera secretos aleatorios en `.env` y `ecommerce/.env`; no los imprime. `SEED_DEMO` queda en `false`.

Para crear el primer administrador de la tienda:

```powershell
cd ecommerce
npm run admin:create
```

## Integración privada

La API privada usa HMAC con timestamp, nonce y firma de la ruta. El cliente interno, nunca el navegador, es quien habla con `/api/integrations/store`.

```text
GET  /api/integrations/store/catalog
POST /api/integrations/store/reservations
GET  /api/integrations/store/reservations/:id
POST /api/integrations/store/reservations/:id/confirm
POST /api/integrations/store/reservations/:id/release
POST /api/integrations/store/orders/:externalOrderId/cancel
```

El catálogo sólo devuelve productos publicados y variantes publicadas. La reserva calcula `quantity - reserved_quantity` para productos por cantidad y cuenta unidades `AVAILABLE` para serializados. `confirm` es una transacción: descuenta stock, cambia unidades a `SOLD`, crea venta, pago y movimientos. `release` es idempotente. Las reservas vencidas se barren cada 15 segundos y en cada consulta de catálogo.

## Flujo de compra

1. El carrito guarda sólo `inventory_variant_id` y cantidad.
2. Cada cotización pide catálogo fresco y recalcula precio USD en el backend del e-commerce.
3. El cliente confirma la cotización; el servidor vuelve a comparar token, precio y stock.
4. Se crea el pedido local y se reserva en NEXO Stock.
5. Transferencia/efectivo quedan pendientes de confirmación administrativa; nunca se marcan pagados solos.
6. Mercado Pago usa la API oficial, webhook firmado y polling de respaldo cuando hay credenciales.
7. Un pago aprobado confirma la reserva; un fallo deja el pedido en revisión, sin inventar stock.
8. Cancelar antes de confirmar libera; después de confirmar usa la operación de anulación de venta del sistema privado y deja el reembolso como evento financiero separado.

## Base de datos del e-commerce

`src/db/schema.sql` contiene únicamente el dominio comercial. No existe una tabla local de productos, variantes, stock, inventario o IMEI. `src/db/migrations.js` registra migraciones versionadas.

Los pedidos guardan un snapshot histórico de nombre, SKU, variante, precio y cantidad; eso es historial inmutable, no una segunda fuente de stock.

## Pagos y proveedores externos

- `MERCADOPAGO_ENABLED=true` requiere `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`.
- Sin credenciales, Mercado Pago queda deshabilitado; no se simula un pago aprobado.
- Transferencia y efectivo requieren habilitación y datos bancarios reales en el panel.
- Email requiere SMTP. Sin SMTP, el outbox queda `NOT_CONFIGURED`; no se afirma que se envió.
- WhatsApp se genera como enlace; no se simula el envío de mensajes.
- Los webhooks de stock requieren `COMMERCE_WEBHOOKS_ENABLED=true` y secretos coincidentes.

## Seguridad

- Cookies HttpOnly, SameSite y `Secure` en producción.
- CSRF por token de sesión para mutaciones de navegador.
- HMAC, timestamp y nonce para integraciones.
- Catálogo sin costos, proveedores, unidades, IMEI, notas internas ni clientes.
- SQLite con foreign keys, WAL, checks y `STRICT`.
- No se sirven `src/`, `server/`, `data/`, SQLite ni archivos internos.

## SEO y contenido renderizado en el servidor

`src/routes/pages.js` sirve el HTML inicial de `/`, `/catalogo` y `/producto/:slug` con el contenido real: nombre, precio, disponibilidad, variantes, características y especificaciones. `src/lib/seo.js` genera Open Graph, Twitter cards, `canonical` y datos estructurados; `src/lib/render.js` compone el documento. `src/lib/auth-guard.js` exige un nonce de CSP también en los scripts JSON-LD.

- `Product` con `AggregateOffer` cuando hay varias variantes, `lowPrice`, `highPrice`, `offerCount` y disponibilidad por variante.
- `OnlineStore` + `WebSite` en la portada, `ItemList` en el catálogo y `BreadcrumbList` en producto y catálogo.
- `sitemap.xml` con priorities y `lastmod`; `robots.txt` excluye `/admin`, `/checkout` y `/cuenta`.
- Sin catálogo verificable, las páginas responden `503`, con `noindex` y el aviso "Estamos actualizando la disponibilidad", nunca datos inventados.

## Analítica

`public/js/analytics.js` reporta `view_item`, `search`, `add_to_cart`, `begin_checkout`, `purchase` y `out_of_stock` a GA4 y Meta Pixel cuando hay identificadores, y siempre al endpoint propio `/api/storefront/analytics`. Los identificadores públicos se configuran en el panel (columnas `ga_measurement_id` y `meta_pixel_id`, migración 4). Sin identificadores la tienda funciona igual. No se envían nombre, email, teléfono ni documento.

## Estructura del navegador

```text
public/index.html          Cáscara mínima; el servidor ya manda el contenido
public/css/styles.css      Interfaz completa
public/css/seo.css         Estilos del HTML sin JavaScript
public/js/app.js           Enrutado, estado y handlers
public/js/store.js         Estado y llamadas a la API
public/js/views.js         Inicio, catálogo, carrito, checkout, cuenta y admin
public/js/product.js       Ficha de producto
public/js/ui.js            Piezas compartidas (precio, stock, variantes, WhatsApp)
public/js/analytics.js     Eventos y etiquetas de terceros
public/js/whatsapp.js      Mensajes de consulta por producto y pedido
```

## Pruebas

```powershell
cd ecommerce
npm test
```

37 pruebas. Cubren health, proyección sin datos privados, carrito, cotización,
idempotencia, reserva, confirmación administrativa, indisponibilidad y cuenta de
cliente; además:

| Archivo | Qué fija |
|---|---|
| `seo.test.js` | El HTML del servidor trae contenido, Open Graph y JSON-LD con precio real |
| `responsive.test.js` | Navegación móvil, rejillas y controles táctiles |
| `analytics.test.js` | Eventos de la lista cerrada, sin datos personales |
| `storefront-assets.test.js` | Módulos del navegador, agrupado de variantes y WhatsApp |
| `client-ids.test.js` | Los ids viajan como texto: convertirlos a `NaN` rompía el carrito |
| `money-format.test.js` | Centavos de la cotización vs. pesos del pedido |

La suite del sistema raíz agrega el recorrido de compra real entre ambos
procesos, la protección de firma, los límites de sobreventa
(`tests/oversell.test.js`) y los doce escenarios de aceptación
(`tests/acceptance.test.js`).

## Desarrollo

```powershell
cd ..            # desde la raíz del proyecto
npm run dev:seed # catálogo MOCK en una base separada
npm run dev:stack
```

Tienda en `http://localhost:4100`, panel en `/admin`. Las bases de desarrollo (`data/nexo-dev.sqlite` y `ecommerce/data/nexo-store-dev.sqlite`) no son las de producción.

## Pendiente de configuración externa

Nada de lo siguiente se presenta como terminado hasta que existan credenciales y una transacción real verificada:

- dominio y TLS de `NEXO Store`;
- credenciales y cuenta de Mercado Pago;
- SMTP real y remitente verificado;
- datos bancarios, WhatsApp y dirección del local;
- identificadores de GA4 y Meta Pixel;
- secreto compartido y URL pública del webhook;
- backup y restore del volumen de cada sistema.

## Escala y límite actual

La base local usa SQLite en modo WAL, transacciones `IMMEDIATE` y una sola instancia de servicio. Es suficiente para un despliegue de un nodo con backups. Para varias réplicas o alto volumen, la migración a PostgreSQL queda como trabajo de infraestructura: no se presenta como implementada.

No se presentan esas integraciones como terminadas hasta que existan credenciales y una transacción real verificada.
