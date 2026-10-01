import { getSettings } from './settings.js';

function safeImages(...values) {
  const result = [];
  for (const value of values) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) continue;
      for (const image of parsed) {
        if (typeof image !== 'string') continue;
        // /img lo sirve express desde assets/img y /public-assets desde la raíz
        // (ver server/app.js). Sólo se admiten rutas de este mismo sitio: nada
        // de http(s) externo ni rutas protocol-relative que se camuflan.
        if (!/^\/(?!\/)(img\/|public-assets\/)/.test(image)) continue;
        if (!result.includes(image)) result.push(image);
      }
    } catch {
      // Una imagen comercial inválida no debe impedir el catálogo público.
    }
  }
  return result;
}

/**
 * Proyección pública segura: no reutiliza bootstrapState porque ese payload
 * contiene unidades, costos, proveedores, clientes y auditoría interna.
 * La web consume exactamente el precio y el stock de la tabla principal.
 */
export function publicCatalog(db) {
  const settings = getSettings(db);
  const rows = db.prepare(`
    SELECT pv.id, pv.variant_name, pv.sale_price, pv.sale_price_registered, pv.promo_price,
           pv.promo_starts_at, pv.promo_ends_at,
           COALESCE(i.quantity, 0) AS stock,
           COALESCE(i.reserved_quantity, 0) AS reserved_stock,
           pv.min_stock, pv.condition, pv.requires_imei,
           b.name AS brand, pm.name AS model,
           COALESCE(cp.name, '') AS capacity, COALESCE(cl.name, '') AS color,
           cat.name AS category, COALESCE(l.name, '') AS location,
           pm.availability_status,
           p.public_images_json, pv.public_images_json
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN capacities cp ON cp.id = pv.capacity_id
    LEFT JOIN colors cl ON cl.id = pv.color_id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    LEFT JOIN locations l ON l.id = pv.location_id
    WHERE p.archived = 0 AND p.published = 1 AND pv.published = 1
      AND pv.active = 1
    ORDER BY pm.name, pv.variant_name
  `).all();
  return {
    business: { name: settings.businessName, location: settings.locationName, currency: settings.currency },
    generatedAt: new Date().toISOString(),
    products: rows.map(row => {
      const now = Date.now();
      const starts = row.promo_starts_at ? Date.parse(row.promo_starts_at) : -Infinity;
      const ends = row.promo_ends_at ? Date.parse(row.promo_ends_at) : Infinity;
      const promoActive = row.sale_price_registered === 1 && row.promo_price !== null && row.promo_price !== undefined && Number(row.promo_price) > 0 && now >= starts && now <= ends;
      const priceKnown = row.sale_price_registered === 1 && Number(row.sale_price) > 0;
      const price = priceKnown ? (promoActive ? Number(row.promo_price) : Number(row.sale_price)) : null;
      const stock = Math.max(0, Number(row.stock) - Number(row.reserved_stock || 0));
      return {
        id: row.id,
        brand: row.brand,
        model: row.model,
        variant: row.variant_name,
        capacity: row.capacity,
        color: row.color,
        category: row.category,
        condition: row.condition,
        location: row.location,
        images: safeImages(row.variant_images_json, row.public_images_json),
        availabilityStatus: row.availability_status,
        requiresImei: row.requires_imei === 1,
        price,
        priceKnown,
        promoPrice: promoActive ? Number(row.promo_price) : null,
        stockStatus: stock === 0 ? 'AGOTADO' : stock <= settings.lastUnitThreshold ? 'ÚLTIMAS UNIDADES' : 'DISPONIBLE'
      };
    })
  };
}
