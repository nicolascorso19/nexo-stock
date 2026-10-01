/**
 * Páginas públicas renderizadas en el servidor.
 *
 * Sirve el HTML inicial con el contenido real y los datos estructurados. La
 * SPA del navegador hidrata a partir de ahí para agregar el carrito, los
 * filtros vivos y el checkout.
 */
import express from 'express';
import { getPublicSettings, getContentBlocks } from '../services/settings.js';
import { flattenCatalog, publicProduct } from '../services/catalog-client.js';
import { renderCatalogPage, catalogPagerMarkup, renderHomePage, renderNotFoundPage, renderProductPage } from '../lib/render.js';
import { absoluteUrl, breadcrumbJsonLd, headTags, jsonLdScript, organizationJsonLd, productJsonLd, truncate } from '../lib/seo.js';
import { matchesCondition, normalizeCondition } from '../lib/catalog-filter.js';

const MAX_SECTION_PRODUCTS = 8;

export function pageRouter({ config, catalogClient }) {
  const router = express.Router();

  /** Catálogo normalizado; null cuando el sistema de stock no responde. */
  async function loadPublished() {
    try {
      const catalog = flattenCatalog(await catalogClient.getCatalog());
      return catalog.products.filter((product) => product.published === true).map(publicProduct);
    } catch {
      return null;
    }
  }

  function shell(products, pathname, overrides = {}) {
    const settings = getPublicSettings();
    const base = config.publicBaseUrl;
    const canonical = absoluteUrl(base, pathname);
    const brand = settings.brandName || 'NEXO';
    const description = overrides.description || settings.seo?.description || 'Tienda de celulares, iPhone, Apple y accesorios en Córdoba Capital con stock real.';
    const blocks = [];
    blocks.push(...headTags({
      title: overrides.title || `${brand} | Celulares, iPhone y Apple en Córdoba`,
      description,
      canonical,
      image: overrides.image,
      type: overrides.type || 'website',
      robots: overrides.robots
    }));
    return { settings, base, canonical, head: blocks.join('\n') };
  }

  /** El JSON-LD también necesita el nonce de la CSP o el navegador lo bloquea. */
  function organizationTags(res, products, overrides = {}) {
    const { settings, base, head } = shell(products, overrides.pathname || '/', overrides);
    if (products === null) return head;
    return `${head}\n${jsonLdScript(organizationJsonLd({
      brandName: settings.brandName || 'NEXO',
      description: overrides.description || settings.seo?.description || '',
      locality: settings.address?.locality,
      supportEmail: settings.supportEmail,
      whatsapp: settings.whatsapp,
      publicBaseUrl: base
    }), res.locals.cspNonce)}`;
  }

  /**
   * La búsqueda es el mismo catálogo con un parámetro. En vez de una segunda
   * página que se desincronizaría de /catalogo (y que la SPA pintaba con el
   * catálogo entero sin filtrar), se redirige y se conserva la URL canónica.
   */
  router.get('/buscar', (req, res) => {
    const search = String(req.originalUrl.split('?')[1] || '');
    res.redirect(302, `/catalogo${search ? `?${search}` : ''}`);
  });

  router.get('/', async (req, res, next) => {
    try {
      const products = await loadPublished();
      const { settings, base } = shell(products, '/');
      if (products === null) {
        return res.status(503).type('html').send(renderHomePage({
          hero: {}, sections: [], settings: { ...settings, categories: [] }, baseUrl: base, unavailable: true,
          seoTags: `${organizationTags(res, null)}\n<meta name="robots" content="noindex">`
        }));
      }
      const hero = getContentBlocks().find((block) => block.block_type === 'HERO') || {};
      const inStock = products.filter((product) => product.variants.some((variant) => variant.availability !== 'OUT'));
      const discounted = products.filter((product) => product.variants.some((variant) => Number(variant.previousPrice) > Number(variant.price)));
      const categories = new Map();
      for (const product of products) {
        if (!product.category) continue;
        const entry = categories.get(product.category) || { name: product.category, count: 0 };
        entry.count += 1;
        categories.set(product.category, entry);
      }
      const sections = [
        { title: 'iPhone', subtitle: 'Los modelos más pedidos, con stock verificado.', href: '/catalogo?category=Celulares', products: products.filter((product) => /iphone/i.test(product.name)).slice(0, MAX_SECTION_PRODUCTS) },
        { title: 'Más vendidos', subtitle: 'Los equipos que la gente más está mirando.', href: '/catalogo?sort=best-sellers', products: inStock.filter((product) => product.isTrending).slice(0, MAX_SECTION_PRODUCTS) },
        { title: 'Ofertas', subtitle: 'Descuentos activos por tiempo limitado.', href: '/catalogo?sort=offers', products: discounted.slice(0, MAX_SECTION_PRODUCTS) },
        { title: 'Accesorios', subtitle: 'Fundas, vidrios, cargadores y más.', href: '/catalogo?category=Accesorios', products: products.filter((product) => product.category === 'Accesorios').slice(0, MAX_SECTION_PRODUCTS) }
      ].filter((section) => section.products.length);
      return res.type('html').send(renderHomePage({
        hero,
        sections,
        settings: { ...settings, categories: [...categories.values()].sort((a, b) => b.count - a.count).slice(0, 6) },
        baseUrl: base,
        seoTags: organizationTags(res, products)
      }));
    } catch (error) { return next(error); }
  });

  router.get('/catalogo', async (req, res, next) => {
    try {
      const query = String(req.query.q || '').trim();
      const category = String(req.query.category || '').trim();
      const brand = String(req.query.brand || '').trim();
      const capacity = String(req.query.capacity || '').trim();
      const color = String(req.query.color || '').trim();
      const availability = String(req.query.availability || '').trim();
      const condition = normalizeCondition(req.query.condition);
      const model = String(req.query.model || '').trim();
      const onlyDiscount = String(req.query.discount || '').trim() === 'true';
      const minPrice = Number.isFinite(Number(req.query.minPrice)) && req.query.minPrice !== '' ? Number(req.query.minPrice) : null;
      const maxPrice = Number.isFinite(Number(req.query.maxPrice)) && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : null;
      const sort = String(req.query.sort || 'relevance');
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = 24;
      const products = await loadPublished();
      const { settings, base } = shell(products, '/catalogo');

      if (products === null) {
        return res.status(503).type('html').send(renderCatalogPage({
          products: [], total: 0, heading: 'Catálogo', subheading: 'Estamos actualizando la disponibilidad. Intentá en unos minutos.',
          baseUrl: base,
          seoTags: `${organizationTags(res, null, { pathname: '/catalogo' })}\n<meta name="robots" content="noindex">`
        }));
      }

          let filtered = products;
      if (query) {
        const needle = query.toLowerCase();
        filtered = filtered.filter((product) => [product.name, product.brand, product.model, product.category, ...product.variants.flatMap((variant) => [variant.sku, variant.capacity, variant.color])].join(' ').toLowerCase().includes(needle));
      }
      if (category) filtered = filtered.filter((product) => product.category?.toLowerCase() === category.toLowerCase());
      if (brand) filtered = filtered.filter((product) => product.brand?.toLowerCase() === brand.toLowerCase());
      if (capacity || color) {
        filtered = filtered.filter((product) => product.variants.some((variant) =>
          (!capacity || variant.capacity?.toLowerCase() === capacity.toLowerCase()) &&
          (!color || variant.color?.toLowerCase() === color.toLowerCase())));
      }
      if (availability === 'in') filtered = filtered.filter((product) => product.variants.some((variant) => variant.availability !== 'OUT'));
      if (availability === 'out') filtered = filtered.filter((product) => product.variants.every((variant) => variant.availability === 'OUT'));
      if (model) filtered = filtered.filter((product) => product.model?.toLowerCase() === model.toLowerCase() || slug(product.model || '') === model.toLowerCase());
      // La condición se resuelve por variante, igual que en la API. Filtrar por
      // producto ocultaría un equipo que tiene variantes nuevas y usadas.
      if (condition) filtered = filtered.filter((product) => product.variants.some((variant) => matchesCondition(variant.condition, condition)));
      if (onlyDiscount) filtered = filtered.filter((product) => product.variants.some((variant) => Number(variant.previousPrice) > Number(variant.price)));
      if (minPrice !== null || maxPrice !== null) {
        filtered = filtered.filter((product) => product.variants.some((variant) => Number.isFinite(Number(variant.price))
          && (minPrice === null || Number(variant.price) >= minPrice) && (maxPrice === null || Number(variant.price) <= maxPrice)));
      }

      const lowest = (product) => {
        const prices = product.variants.map((variant) => Number(variant.price)).filter(Number.isFinite);
        return prices.length ? Math.min(...prices) : Infinity;
      };
      const discount = (product) => Math.max(0, ...product.variants.map((variant) => (Number(variant.previousPrice) > Number(variant.price)
        ? 1 - Number(variant.price) / Number(variant.previousPrice) : 0)));
      const sorted = [...filtered];
      if (sort === 'price-asc') sorted.sort((a, b) => lowest(a) - lowest(b));
      else if (sort === 'price-desc') sorted.sort((a, b) => lowest(b) - lowest(a));
      else if (sort === 'offers') sorted.sort((a, b) => discount(b) - discount(a));
      else if (sort === 'newest') sorted.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
      else sorted.sort((a, b) => Number(Boolean(b.isTrending)) - Number(Boolean(a.isTrending)) || a.name.localeCompare(b.name));

      const heading = query
        ? `Resultados para “${truncate(query, 40)}”`
        : category
          ? category
          : brand || 'Catálogo';
      const subheading = 'Cada disponibilidad y precio se valida nuevamente al agregar y al confirmar.';
      // Sólo las búsquedas con filtros variables se indexan; el listado plano
      // puede generar infinitas URLs equivalentes para los buscadores.
      // La página de catálogo se indexa; sólo se marca noindex cuando el
      // catálogo no pudo verificarse contra el sistema de stock.
      const robots = 'index,follow';
      const pageProducts = sorted.slice((page - 1) * pageSize, page * pageSize);

      const seoTags = [
        organizationTags(res, products, { pathname: '/catalogo', title: `${heading} | ${settings.brandName}`, description: subheading, robots }),
        jsonLdScript({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: heading,
          numberOfItems: sorted.length,
          itemListElement: pageProducts.map((product, index) => ({
            '@type': 'ListItem',
            position: (page - 1) * pageSize + index + 1,
            url: absoluteUrl(base, `/producto/${product.slug || product.id}`),
            name: product.name
          }))
        }, res.locals.cspNonce),
        jsonLdScript(breadcrumbJsonLd([
          { name: 'Inicio', href: '/', baseUrl: base },
          { name: 'Catálogo' }
        ]), res.locals.cspNonce)
      ].join('\n');

      return res.type('html').send(renderCatalogPage({
        products: pageProducts,
        total: sorted.length,
        heading,
        subheading,
        crumbs: [{ name: 'Inicio', href: '/' }, { name: 'Catálogo' }],
        baseUrl: base,
        pagerMarkup: catalogPagerMarkup({ currentPath: '/catalogo', query: req.query, page, pageSize, total: sorted.length }),
        seoTags
      }));
    } catch (error) { return next(error); }
  });

  router.get('/producto/:slug', async (req, res, next) => {
    try {
      const products = await loadPublished();
      const { settings, base } = shell(products, `/producto/${req.params.slug}`);

      if (products === null) {
        return res.status(503).type('html').send(renderNotFoundPage({
          seoTags: `${headTags({ title: 'Actualizando disponibilidad', description: 'Estamos sincronizando con el sistema de stock.', canonical: absoluteUrl(base, `/producto/${req.params.slug}`) })}\n<meta name="robots" content="noindex">`
        }));
      }

      const slug = String(req.params.slug);
      const product = products.find((item) => String(item.slug) === slug || String(item.id) === slug);
      if (!product) {
        return res.status(404).type('html').send(renderNotFoundPage({
          seoTags: `${headTags({ title: 'Producto no encontrado', description: 'El producto no está disponible.', canonical: absoluteUrl(base, `/producto/${slug}`) })}\n<meta name="robots" content="noindex,follow">`
        }));
      }

      const url = absoluteUrl(base, `/producto/${product.slug || product.id}`);
      const related = products
        .filter((item) => item.id !== product.id && (item.brandId === product.brandId || item.categoryId === product.categoryId))
        .slice(0, 4);
      const title = `${product.name} | ${settings.brandName}`;
      const description = truncate(product.description || `Comprar ${product.name} en ${settings.brandName}, Córdoba. Stock verificado y entrega en Córdoba Capital.`, 158);
      const image = (product.images || [])[0] || (product.variants || []).flatMap((variant) => variant.images || [])[0];
      const head = [
        ...headTags({ title, description, canonical: url, image, type: 'product' }),
        jsonLdScript(productJsonLd({ product, baseUrl: base, url }), res.locals.cspNonce),
        jsonLdScript(breadcrumbJsonLd([
          { name: 'Inicio', href: '/', baseUrl: base },
          { name: 'Catálogo', href: '/catalogo', baseUrl: base },
          { name: product.name }
        ]), res.locals.cspNonce)
      ].join('\n');

      return res.type('html').send(renderProductPage({ product, related, settings, seoTags: head, baseUrl: base }));
    } catch (error) { return next(error); }
  });

  /** Igual que el slug de la API: minúsculas, sin acentos, con guiones. */
  function slug(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return router;
}
