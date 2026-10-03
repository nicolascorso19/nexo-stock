/* NEXO Stock · capa de presentación y acciones de usuario. */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const importFile = document.getElementById('import-file');
  const store = window.StockStore;
  const C = window.StockCatalog;

  const view = {
    page: 'dashboard',
    inventoryQuery: '',
    inventoryStock: '',
    inventoryBrand: '',
    inventoryCapacity: '',
    inventoryColor: '',
    inventoryCondition: '',
    inventoryMinPrice: '',
    inventoryMaxPrice: '',
    inventoryDate: '',
    inventorySort: 'novedad',
    salesQuery: '',
    salesFilter: '',
    purchasesQuery: '',
    movementsQuery: '',
    customersQuery: '',
    suppliersQuery: '',
    chartRange: 7,
    reportRange: '30',
    productTab: 'list',
    settingsTab: 'general',
    loginRequired: true,
    booting: true,
    saleDraft: null,
    purchaseDraft: null,
    importRows: null,
    openMenu: null
  };

  const iconPaths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.7 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/>',
    truck: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    arrows: '<path d="M7 7h12l-3-3M17 17H5l3 3M19 7l-3 3M5 17l3-3"/>',
    package: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8M7.5 5.5l9 5"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v-6H4ZM20 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6h2Z"/>',
    building: '<path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M2 21h20M8 7h3M8 11h3M8 15h3M13 7h1M13 11h1M13 15h1M19 21v-8h1a1 1 0 0 1 1 1v7"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    chart: '<path d="M4 19V5M4 19h17M8 16v-4M12 16V8M16 16v-7M20 16v-11"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 0 1-4 0v-.2A2 2 0 0 0 5.8 18l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12a2 2 0 0 1 2-2h.2a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A2 2 0 0 0 11.4 2.4V2a2 2 0 0 1 4 0v.2A2 2 0 0 0 18.8 4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1A2 2 0 0 0 23 10h.2a2 2 0 0 1 0 4H23a2 2 0 0 0-1.6 3Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
    refresh: '<path d="M20 11a8.1 8.1 0 0 0-14.8-4L3 10M3 4v6h6M4 13a8.1 8.1 0 0 0 14.8 4L21 14m0 6v-6h-6"/>',
    alert: '<path d="M10.3 3.5 2.4 17.2A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.8L13.7 3.5a2 2 0 0 0-3.4 0ZM12 9v4M12 16h.01"/>',
    trend: '<path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>',
    wallet: '<path d="M4 5h15a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM2 8h17M16 14h5"/><circle cx="16" cy="14" r=".7" fill="currentColor" stroke="none"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    sparkles: '<path d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3ZM19 16l-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6L19 16Z"/>',
    receipt: '<path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2-3-2ZM8 9h8M8 13h6"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    arrowUp: '<path d="m18 15-6-6-6 6"/>',
    arrowDown: '<path d="m6 9 6 6 6-6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    archive: '<path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18a2.1 2.1 0 0 0 3 3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-3-3 2.5-2.5Z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.9 1-2.1 1.4-2.1 3M12 17h.01"/>',
    moreVertical: '<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'
  };

  function icon(name, className = '') {
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.grid}</svg>`;
  }

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const number = value => Number(value) || 0;
  const currencySymbol = () => 'US$';
  const money = (value, fallback = 'Sin registro') => {
    if (value === null || value === undefined || value === '') return fallback;
    return `US$ ${number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const compactMoney = value => {
    if (value === null || value === undefined || value === '') return 'Sin registro';
    const n = number(value);
    if (n >= 1000000) return `US$ ${(n / 1000000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
    if (n >= 1000) return `US$ ${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
    return money(n);
  };
  const todayInput = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const dateLabel = value => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)).replace('.', '');
  };
  const dateTimeLabel = value => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  };
  const relativeDate = value => {
    if (!value) return '—';
    const diff = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (diff < 2) return 'Ahora';
    if (diff < 60) return `Hace ${diff} min`;
    if (diff < 1440) return `Hace ${Math.floor(diff / 60)} h`;
    if (diff < 10080) return `Hace ${Math.floor(diff / 1440)} d`;
    return dateLabel(value);
  };
  const initials = value => String(value || 'NR').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const productName = product => `${product.brand} ${product.model}`;
  const variantName = product => product.variant || `${product.capacity || ''}${product.capacity ? ' · ' : ''}${product.color || ''}`;
  const productClass = product => product.brand === 'Apple' ? '' : product.brand === 'Samsung' ? 'samsung' : product.category === 'Accesorios' ? 'accessory' : '';
  const profit = product => product?.price === null || product?.price === undefined || product?.cost === null || product?.cost === undefined ? null : number(product.price) - number(product.cost);
  const margin = product => profit(product) === null || !number(product.price) ? null : (profit(product) / number(product.price)) * 100;
  const userName = id => store.getUser(id)?.name || 'Sistema';
  const supplierName = id => store.getSupplier(id)?.name || 'Sin proveedor';
  const customerName = id => store.getCustomer(id)?.name || 'Cliente mostrador';
  const availableUnits = productId => store.getState().units.filter(unit => unit.productId === productId && unit.status === 'Disponible');
  const reservedUnits = productId => store.getState().units.filter(unit => unit.productId === productId && unit.status === 'Reservado');
  const soldUnits = productId => store.getState().units.filter(unit => unit.productId === productId && unit.status === 'Vendido');
  const stockState = product => product.stock <= 0 ? { label: 'Agotado', tone: 'danger' } : product.stock <= (store.getSettings().lastUnitThreshold || 1) ? { label: 'Última unidad', tone: 'warning' } : product.stock <= product.minStock ? { label: 'Stock bajo', tone: 'warning' } : { label: 'Disponible', tone: 'success' };
  const hasRole = (...roles) => roles.includes(store.getSessionUser()?.role);
  const pageRoles = { dashboard: ['Administrador', 'Vendedor', 'Inventario'], inventory: ['Administrador', 'Vendedor', 'Inventario'], sales: ['Administrador', 'Vendedor'], purchases: ['Administrador', 'Inventario'], movements: ['Administrador', 'Inventario'], products: ['Administrador', 'Vendedor', 'Inventario'], suppliers: ['Administrador', 'Inventario'], customers: ['Administrador', 'Vendedor'], reports: ['Administrador'], users: ['Administrador'], settings: ['Administrador'] };
  const canOpenPage = page => !pageRoles[page] || pageRoles[page].includes(store.getSessionUser()?.role);
  const requireRole = (...roles) => {
    if (hasRole(...roles)) return true;
    showToast('error', 'Acceso restringido', 'Tu rol no tiene permiso para realizar esta operación.');
    return false;
  };
  const options = (items, selected = '', placeholder = 'Seleccionar') => `<option value="">${esc(placeholder)}</option>${items.map(item => { const value = typeof item === 'string' ? item : item.value; const label = typeof item === 'string' ? item : item.label; return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}`;

  function metricCard(label, value, iconName, tone, foot, footClass = '') {
    return `<div class="card metric-card" style="--metric-color:var(--${tone});--metric-tint:var(--${tone}-soft)"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon">${icon(iconName)}</span></div><div class="metric-value">${esc(value)}</div><div class="metric-foot ${footClass}">${foot || ''}</div></div>`;
  }

  function pageHead(kicker, title, subtitle, actions = '') {
    return `<div class="page-head"><div class="page-title-wrap"><div class="eyebrow"><span class="eyebrow-dot"></span>${esc(kicker)}</div><h1>${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div><div class="page-actions">${actions}</div></div>`;
  }

  function emptyState(title, text, action = '') {
    return `<div class="empty-state"><div class="empty-state-icon">${icon('package')}</div><strong>${esc(title)}</strong><p>${esc(text)}</p>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
  }

  function statusPill(label, tone = 'neutral') {
    return `<span class="status-pill ${tone}">${esc(label)}</span>`;
  }

  function productThumb(product, extra = '') {
    return `<span class="product-thumb ${productClass(product)} ${extra}">${icon(product.category === 'Accesorios' ? 'headphones' : 'smartphone')}</span>`;
  }

  function shell(content) {
    const user = store.getSessionUser() || { name: 'Nicolás Romero', role: 'Administrador', avatar: 'NR' };
    const metrics = store.getMetrics();
    const navGroups = [
      { label: 'Workspace', items: [
        ['dashboard', 'Dashboard', 'grid'], ['inventory', 'Inventario', 'box'], ['sales', 'Ventas', 'cart'], ['purchases', 'Compras', 'truck'], ['movements', 'Movimientos', 'arrows']
      ] },
      { label: 'Catálogo', items: [
        ['products', 'Productos', 'package'], ['suppliers', 'Proveedores', 'building'], ['customers', 'Clientes', 'users']
      ] },
      { label: 'Análisis', items: [
        ['reports', 'Reportes', 'chart'], ['users', 'Usuarios', 'shield'], ['settings', 'Configuración', 'settings']
      ] }
    ];
    const allowedPages = {
      dashboard: ['Administrador', 'Vendedor', 'Inventario'],
      inventory: ['Administrador', 'Vendedor', 'Inventario'],
      sales: ['Administrador', 'Vendedor'],
      purchases: ['Administrador', 'Inventario'],
      movements: ['Administrador', 'Inventario'],
      products: ['Administrador', 'Vendedor', 'Inventario'],
      suppliers: ['Administrador', 'Inventario'],
      customers: ['Administrador', 'Vendedor'],
      reports: ['Administrador'],
      users: ['Administrador'],
      settings: ['Administrador']
    };
    const nav = navGroups.map(group => {
      const items = group.items.filter(([page]) => allowedPages[page].includes(user.role));
      if (!items.length) return '';
      return `<div class="nav-group"><div class="nav-label">${group.label}</div>${items.map(([page, label, iconName]) => `<button class="nav-item ${view.page === page ? 'active' : ''}" data-page="${page}" aria-current="${view.page === page ? 'page' : 'false'}"><span class="nav-icon">${icon(iconName)}</span><span class="nav-text">${label}</span>${page === 'inventory' && metrics.lowStock ? `<span class="nav-badge">${metrics.lowStock}</span>` : ''}</button>`).join('')}</div>`;
    }).join('');
    return `<div class="app-shell"><aside class="sidebar ${view.openMenu ? 'open' : ''}" id="sidebar"> <div class="brand"><div class="brand-mark">N</div><div><div class="brand-name">NEXO</div><div class="brand-sub">stock & ventas</div></div></div><nav class="nav-wrap">${nav}</nav><div class="sidebar-foot"><div class="sidebar-tip"><div class="sidebar-tip-head"><span class="tip-dot"></span> Base de datos conectada</div><p>Último backup: <strong>${esc(relativeDate(store.getSettings().lastBackup))}</strong></p><p style="margin-top:6px">Tip: <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar rápido.</p></div></div></aside>${view.openMenu ? '<div class="sidebar-overlay" data-action="toggle-sidebar"></div>' : ''}<main class="main"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="Abrir menú">${icon('menu')}</button><div class="breadcrumb"><span>Workspace</span>${icon('right')}<strong>${esc(pageTitle(view.page))}</strong></div></div><div class="topbar-actions"><button class="global-search" data-action="open-search" aria-label="Búsqueda global">${icon('search')}<input id="global-search" placeholder="Buscar modelo, IMEI, SKU…" autocomplete="off"/><span class="search-shortcut">Ctrl K</span></button><button class="icon-button notification-wrap" data-action="show-notifications" aria-label="Notificaciones">${icon('bell')}${store.getSettings().lowStockNotifications && metrics.lowStock + metrics.outOfStock > 0 ? '<span class="notification-dot"></span>' : ''}</button><div style="position:relative"><button class="user-menu" data-action="toggle-profile"><span class="avatar">${esc(user.avatar || initials(user.name))}</span><span class="user-meta"><span class="user-name">${esc(user.name)}</span><span class="user-role">${esc(user.role)}</span></span><span class="user-chevron">${icon('chevron')}</span></button>${view.openMenu === 'profile' ? `<div class="profile-popover"><div class="popover-name"><strong>${esc(user.name)}</strong><span>${esc(user.email || '')}</span></div><button class="profile-action" data-page="settings">${icon('settings')} Configuración</button><button class="profile-action" data-action="logout">${icon('logout')} Cerrar sesión</button></div>` : ''}</div></div></header><section class="content">${content}</section></main></div>`;
  }

  function pageTitle(page) {
    return ({ dashboard: 'Dashboard', inventory: 'Inventario', sales: 'Ventas', purchases: 'Compras', movements: 'Movimientos', products: 'Productos', suppliers: 'Proveedores', customers: 'Clientes', reports: 'Reportes', users: 'Usuarios', settings: 'Configuración' }[page] || 'Dashboard');
  }

  function renderLogin() {
    return `<div class="login-screen"><div class="login-visual"><div class="login-brand"><div class="brand-mark">N</div><strong>NEXO</strong></div><div class="login-hero"><div class="eyebrow"><span class="eyebrow-dot"></span>STOCK & VENTAS</div><h1>Tu inventario, siempre bajo control.</h1><p>La herramienta simple y profesional para operar un local de celulares con precisión, trazabilidad y datos claros.</p><div class="login-feature-list"><span class="login-feature">${icon('check')} Stock por IMEI</span><span class="login-feature">${icon('check')} Ventas y ganancias</span><span class="login-feature">${icon('check')} Alertas inteligentes</span></div></div><div class="login-foot">© 2026 NEXO Stock · Diseñado para negocios que crecen.</div></div><div class="login-panel"><div class="login-card"><div class="login-card-head"><div class="eyebrow"><span class="eyebrow-dot"></span>BIENVENIDO</div><h2>Iniciá sesión</h2><p>Ingresá a tu espacio de trabajo para continuar.</p></div><form class="login-form" id="login-form"><div class="field"><label class="field-label" for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" autocomplete="username" required placeholder="tu@email.com"/></div><div class="field"><label class="field-label" for="login-password">Contraseña</label><div class="password-wrap"><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"/><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Mostrar contraseña">${icon('eye')}</button></div></div><div class="login-options"><span class="remember">Sesión segura de 12 horas</span><button class="forgot" type="button" data-action="forgot-password">¿Olvidaste tu contraseña?</button></div><div id="login-error" class="field-error" style="display:none"></div><button class="btn btn-primary btn-lg btn-block" type="submit">${icon('shield')} Ingresar al sistema</button></form><div class="login-helper"><strong>Acceso demo:</strong> <code>admin@nexo.com</code> · <code>admin123</code><br/>La base de demostración carga datos ficticios y marca sus IMEI como tales.</div><div class="security-note">${icon('lock')} Sesión protegida · Base de datos persistente</div></div></div></div>`;
  }

  function render() {
    if (view.booting) {
      app.innerHTML = '<div class="boot-screen"><div class="boot-mark">N</div><div class="boot-copy">Conectando con la base de datos…</div></div>';
      return;
    }
    if (view.loginRequired || !store.getSessionUser()) {
      view.loginRequired = true;
      app.innerHTML = renderLogin();
      return;
    }
    const pages = { dashboard: renderDashboard, inventory: renderInventory, sales: renderSales, purchases: renderPurchases, movements: renderMovements, products: renderProducts, suppliers: renderSuppliers, customers: renderCustomers, reports: renderReports, users: renderUsers, settings: renderSettings };
    app.innerHTML = shell((pages[view.page] || renderDashboard)());
    if (view.openMenu === 'profile') view.openMenu = null;
  }

  /* Dashboard */
  function renderDashboard() {
    const metrics = store.getMetrics();
    const series = store.getDailySeries(view.chartRange);
    const topProducts = store.getTopProducts(5, 30);
    const lowProducts = store.getProducts().filter(product => product.stock <= product.minStock).sort((a, b) => a.stock - b.stock).slice(0, 5);
    const recentMovements = [...store.getState().movements].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 5);
    const currentUser = store.getSessionUser();
    const canSeeFinancials = hasRole('Administrador', 'Inventario');
    const canSell = hasRole('Administrador', 'Vendedor');
    const canManageStock = hasRole('Administrador', 'Inventario');
    const canViewReports = hasRole('Administrador');
    const stockByBrand = Object.entries(store.getState().products.reduce((acc, product) => { acc[product.brand] = (acc[product.brand] || 0) + product.stock; return acc; }, {})).sort((a, b) => b[1] - a[1]);
    const totalUnits = stockByBrand.reduce((sum, item) => sum + item[1], 0) || 1;
    const donutColors = ['#3366f5', '#17a673', '#ef8c2f', '#8367e8', '#e45858', '#58a8c9'];
    let offset = 0;
    const circumference = 2 * Math.PI * 49;
    const circles = stockByBrand.map(([, value], index) => { const length = (value / totalUnits) * circumference; const segment = `<circle cx="60" cy="60" r="49" fill="none" stroke="${donutColors[index % donutColors.length]}" stroke-width="12" stroke-dasharray="${Math.max(0, length - 2)} ${circumference}" stroke-dashoffset="${-offset}" stroke-linecap="round"/>`; offset += length; return segment; }).join('');
    return `<div class="demo-strip">${icon('info')}<span><strong>${esc(store.getSettings().locationName || 'Córdoba Capital')}.</strong> Los datos muestran únicamente stock y operaciones registradas en esta instalación.</span><a class="card-link" style="margin-left:auto;white-space:nowrap" href="/public" target="_blank">Ver web pública →</a>${hasRole('Administrador') ? '<button class="card-link" data-page="settings">Configurar →</button>' : ''}</div>${pageHead('Resumen del negocio', `Hola, ${esc((currentUser?.name || 'Nicolás').split(' ')[0])} 👋`, 'Una mirada clara a lo que está pasando hoy en tu local.', `${canSeeFinancials ? `<button class="btn btn-secondary" data-action="export" data-export="dashboard">${icon('download')} Exportar</button>` : ''}${canSell ? `<button class="btn btn-primary" data-action="open-sale">${icon('plus')} Nueva venta</button>` : ''}`)}<div class="welcome-card"><div class="welcome-copy"><div class="welcome-kicker">${icon('sparkles')} OPERACIÓN AL DÍA</div><div class="welcome-title">Tu negocio, en control.</div><p class="welcome-text">${metrics.lowStock || metrics.outOfStock ? `Hay ${metrics.lowStock} productos con stock bajo y ${metrics.outOfStock} sin stock.` : 'No hay alertas de stock pendientes en este momento.'}</p></div><div class="welcome-actions">${canManageStock ? `<button class="btn btn-secondary" data-action="open-stock">${icon('plus')} Agregar stock</button>` : ''}${canSell ? `<button class="btn btn-secondary" data-action="open-sale">${icon('plus')} Nueva venta</button>` : ''}${canViewReports ? `<button class="btn btn-secondary" data-page="reports">${icon('chart')} Ver reportes</button>` : ''}</div></div><div class="metric-grid">${metricCard('Capital en inventario', canSeeFinancials ? compactMoney(metrics.stockValue) : 'No visible', 'wallet', 'blue', canSeeFinancials ? `<span class="metric-up">Valor de compra</span><span>· ${metrics.units} unidades</span>` : '<span>Requiere rol administrador o inventario</span>')}${metricCard('Ventas del mes', money(metrics.salesMonth), 'cart', 'mint', `<span class="${metrics.salesTrendPercent == null ? '' : metrics.salesTrendPercent >= 0 ? 'metric-up' : 'metric-down'}">${metrics.salesTrendPercent == null ? 'Sin comparativo' : `${metrics.salesTrendPercent >= 0 ? '+' : ''}${metrics.salesTrendPercent.toFixed(1)}%`}</span><span>vs. mes anterior</span>`)}${metricCard('Ganancia estimada', canSeeFinancials ? money(metrics.profitMonth) : 'No visible', 'trend', 'orange', canSeeFinancials ? `<span class="metric-up">Margen ${metrics.salesMonth ? ((metrics.profitMonth / metrics.salesMonth) * 100).toFixed(1) : 0}%</span><span>este mes</span>` : '<span>Datos protegidos por rol</span>')}${metricCard('Ventas de hoy', money(metrics.salesDay), 'receipt', 'purple', `<span>${metrics.unitsSoldMonth} unidades vendidas este mes</span>`)}</div><div class="metric-grid">${metricCard('Productos activos', String(metrics.productCount), 'package', 'blue', `<span>${metrics.productCount ? 'Catálogo actualizado' : 'Sin productos'}</span>`)}${metricCard('Compras del mes', canSeeFinancials ? money(metrics.purchasesMonth) : 'No visible', 'truck', 'orange', canSeeFinancials ? '<span>Flujo de capital</span>' : '<span>Datos protegidos por rol</span>')}${metricCard('Stock bajo', String(metrics.lowStock), 'alert', 'orange', `<span class="metric-warn">Revisar alertas</span>`, 'metric-warn')}${metricCard('Sin stock', String(metrics.outOfStock), 'archive', 'red', `<span class="metric-down">Reabastecer</span>`, 'metric-down')}</div><div class="dashboard-grid"><div class="card chart-card"><div class="card-head"><div><h2 class="card-title">Rendimiento de ventas</h2><p class="card-caption">Ventas y ganancias por día</p></div><div class="chart-legend-row"><div class="legend"><span class="legend-item"><i class="legend-dot blue"></i> Ventas</span><span class="legend-item"><i class="legend-dot mint"></i> Ganancia</span></div><div class="period-tabs">${[7, 14, 30].map(days => `<button class="period-tab ${view.chartRange === days ? 'active' : ''}" data-action="set-chart-range" data-days="${days}">${days}d</button>`).join('')}</div></div></div><div class="card-body" style="padding-top:10px">${renderLineChart(series)}</div></div><div class="card"><div class="card-head"><div><h2 class="card-title">Stock por marca</h2><p class="card-caption">Distribución de unidades disponibles</p></div><button class="card-link" data-page="inventory">Ver inventario →</button></div><div class="donut-wrap"><div class="donut"><svg viewBox="0 0 120 120" aria-label="Stock por marca"><circle cx="60" cy="60" r="49" fill="none" stroke="#f0f2f6" stroke-width="12"/>${circles}</svg><div class="donut-total"><strong>${metrics.units}</strong><span>unidades</span></div></div><div class="donut-legend">${stockByBrand.slice(0, 5).map(([brand, value], index) => `<div class="donut-legend-row"><i class="legend-color" style="background:${donutColors[index % donutColors.length]}"></i><span class="legend-name">${esc(brand)}</span><strong>${value}</strong></div>`).join('') || '<span class="card-caption">Sin stock</span>'}</div></div></div></div><div class="dashboard-grid"><div class="card"><div class="card-head"><div><h2 class="card-title">Productos más vendidos</h2><p class="card-caption">Ranking de los últimos 30 días</p></div><button class="card-link" data-page="sales">Ver ventas →</button></div><div class="ranking-list">${topProducts.length ? topProducts.map((item, index) => `<div class="ranking-item"><span class="${index < 3 ? 'rank-medal' : 'rank'}">${index + 1}</span><div class="product-mini"><strong>${esc(item.product ? productName(item.product) : 'Producto eliminado')}</strong><span>${esc(item.product ? variantName(item.product) : '')}</span></div><span class="rank-value">${item.quantity} <small style="font:500 9px DM Sans;color:#98a2b3">uds</small></span></div>`).join('') : emptyState('Todavía no hay ventas', 'Registrá tu primera venta para ver el ranking.')}</div></div><div class="card"><div class="card-head"><div><h2 class="card-title">Alertas de stock</h2><p class="card-caption">Reabastecé antes de quedarte sin stock</p></div><button class="card-link" data-page="inventory">Ver todo →</button></div><div class="alert-list">${lowProducts.length ? lowProducts.map(product => { const state = stockState(product); return `<div class="alert-row"><span class="alert-status ${state.tone === 'danger' ? 'out' : 'low'}"></span><div class="alert-content"><strong>${esc(productName(product))} · ${esc(variantName(product))}</strong><span>Stock mínimo: ${product.minStock} · ${esc(product.location)}</span></div><span class="alert-stock">${state.tone === 'danger' ? 'SIN STOCK' : `${product.stock} uds`}</span></div>`; }).join('') : '<div class="empty-state" style="padding:25px 5px"><div class="empty-state-icon" style="color:#17a673;background:#e8f8f1">'+icon('check')+'</div><strong>Todo bajo control</strong><p>No hay alertas de stock.</p></div>'}</div></div></div><div class="dashboard-grid"><div class="card wide"><div class="card-head"><div><h2 class="card-title">Actividad reciente</h2><p class="card-caption">Últimos movimientos registrados en el sistema</p></div><button class="card-link" data-page="movements">Ver historial →</button></div><div class="activity-list">${recentMovements.length ? recentMovements.map(renderActivity).join('') : emptyState('Sin actividad', 'Las operaciones aparecerán aquí.')}</div></div></div>`;
  }

  function renderLineChart(series) {
    const width = 720;
    const height = 190;
    const left = 42;
    const right = 8;
    const top = 12;
    const bottom = 27;
    const max = Math.max(...series.map(item => Math.max(item.sales, item.profit)), 1) * 1.18;
    const x = index => left + (index / Math.max(series.length - 1, 1)) * (width - left - right);
    const y = value => top + (1 - value / max) * (height - top - bottom);
    const pointsSales = series.map((item, index) => `${x(index)},${y(item.sales)}`).join(' ');
    const pointsProfit = series.map((item, index) => `${x(index)},${y(item.profit)}`).join(' ');
    const area = `${left},${height - bottom} ${pointsSales} ${width - right},${height - bottom}`;
    const grid = [0, .25, .5, .75, 1].map(ratio => { const yy = top + ratio * (height - top - bottom); const label = compactMoney(max * (1 - ratio)); return `<line class="chart-grid-line" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text class="chart-axis-label" x="0" y="${yy + 3}">${label}</text>`; }).join('');
    const labels = series.map((item, index) => `<text class="chart-axis-label" text-anchor="middle" x="${x(index)}" y="${height - 5}">${esc(item.label)}</text>`).join('');
    return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3366f5" stop-opacity=".17"/><stop offset="1" stop-color="#3366f5" stop-opacity="0"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}"/><polyline class="chart-line-sales" points="${pointsSales}"/><polyline class="chart-line-profit" points="${pointsProfit}"/>${series.map((item, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(item.sales)}" r="3.5"/><circle cx="${x(index)}" cy="${y(item.profit)}" r="3" fill="#fff" stroke="#17a673" stroke-width="2"/>`).join('')}${labels}</svg></div>`;
  }

  function renderActivity(movement) {
    const product = store.getProduct(movement.productId);
    const isSale = movement.type === 'Venta';
    const isEntry = movement.type === 'Entrada';
    const typeClass = isSale ? 'mint' : isEntry ? '' : 'orange';
    return `<div class="activity-item"><span class="activity-icon ${typeClass}">${icon(isSale ? 'cart' : isEntry ? 'plus' : 'arrows')}</span><div class="activity-copy"><strong>${esc(movement.type)} · ${esc(product ? productName(product) : 'Producto')}</strong><span>${movement.quantity > 0 ? '+' : ''}${movement.quantity} unidad${Math.abs(movement.quantity) === 1 ? '' : 'es'} · ${movement.stockBefore} → ${movement.stockAfter} · ${esc(movement.reason || '')}</span></div><span class="activity-time">${esc(relativeDate(movement.createdAt || movement.date))}</span></div>`;
  }

  /* Inventory / products */
  /**
   * El inventario se lee en dos bloques, como pide el local: primero los equipos
   * (iPhone 13 en adelante, MacBook y AirPods) y después los accesorios (fundas,
   * vidrios, cables, cargadores). Los filtros de arriba siguen mandando sobre
   * los dos: si no hay resultados en un bloque, no se muestra.
   */
  function renderGruposInventario(products, canSeeFinancials) {
    const equipos = products.filter(product => product.grupo === 'equipos');
    const accesorios = products.filter(product => product.grupo !== 'equipos');
    const bloques = [
      { grupo: 'equipos', titulo: 'Equipos', detalle: 'iPhone 13 en adelante, MacBook y AirPods', items: equipos },
      { grupo: 'accesorios', titulo: 'Accesorios', detalle: 'Fundas, vidrios, cables, cargadores y otros', items: accesorios }
    ].filter(bloque => bloque.items.length > 0);

    if (!bloques.length) {
      return emptyState('No encontramos productos', 'Probá cambiar los filtros o agregá un nuevo producto.', `${hasRole('Administrador') ? `<button class="btn btn-primary btn-sm" data-action="open-product">${icon('plus')} Agregar producto</button>` : ''}`);
    }

    return bloques.map(bloque => {
      const unidades = bloque.items.reduce((suma, product) => suma + Number(product.stock || 0), 0);
      const sinStock = bloque.items.filter(product => Number(product.stock || 0) === 0).length;
      return `<section class="inventory-group" aria-labelledby="grupo-${bloque.grupo}">
        <div class="inventory-group-head">
          <div>
            <h2 class="inventory-group-title" id="grupo-${bloque.grupo}">${esc(bloque.titulo)}</h2>
            <p class="inventory-group-detail">${esc(bloque.detalle)}</p>
          </div>
          <div class="inventory-group-counts">
            <span><b>${bloque.items.length}</b> ${bloque.items.length === 1 ? 'variante' : 'variantes'}</span>
            <span><b>${unidades}</b> unidades</span>
            ${sinStock ? `<span class="is-warn"><b>${sinStock}</b> sin stock</span>` : ''}
          </div>
        </div>
        <div class="card table-card inventory-table-card">
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>Producto</th><th>Variante</th><th>Stock</th>${canSeeFinancials ? '<th class="num">Costo</th>' : ''}<th class="num">Venta</th>${canSeeFinancials ? '<th class="num">Ganancia</th>' : ''}<th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${bloque.items.map(renderProductRow).join('')}</tbody>
          </table></div>
          <div class="mobile-card-list">${bloque.items.map(renderMobileProduct).join('')}</div>
        </div>
      </section>`;
    }).join('');
  }

  function renderInventory() {
    const products = filteredProducts();
    const all = store.getProducts();
    const canSeeFinancials = hasRole('Administrador', 'Inventario');
    const totalUnits = all.reduce((sum, product) => sum + product.stock, 0);
    const totalValue = store.getMetrics().stockValue;
    const low = all.filter(product => product.stock > 0 && product.stock <= product.minStock).length;
    const out = all.filter(product => product.stock === 0).length;
    const content = `${pageHead('Control de inventario', 'Inventario', 'Consultá, filtrá y actualizá el stock de todos tus productos.', `${canSeeFinancials ? `<button class="btn btn-secondary" data-action="export" data-export="inventory">${icon('download')} Exportar CSV</button><button class="btn btn-secondary" data-action="export" data-export="inventory">${icon('download')} Google Sheets</button>` : ''}${hasRole('Administrador', 'Inventario') ? `<button class="btn btn-soft-orange" data-action="open-subtract">${icon('minus')} Restar stock</button><button class="btn btn-primary" data-action="open-stock">${icon('plus')} Agregar stock</button>` : ''}`)}<div class="stat-strip" style="margin-bottom:18px"><div class="stat-box"><div class="stat-box-label">Unidades en stock</div><div class="stat-box-value">${totalUnits}</div></div><div class="stat-box"><div class="stat-box-label">Valor de inventario</div><div class="stat-box-value blue">${money(totalValue)}</div></div><div class="stat-box"><div class="stat-box-label">Stock bajo</div><div class="stat-box-value orange">${low}</div></div><div class="stat-box"><div class="stat-box-label">Sin stock</div><div class="stat-box-value">${out}</div></div></div>${renderInventoryFilters(products.length)}${renderGruposInventario(products, canSeeFinancials)}</div>`;
    return content;
  }

  function filteredProducts() {
    const minimum = view.inventoryMinPrice === '' ? null : number(view.inventoryMinPrice);
    const maximum = view.inventoryMaxPrice === '' ? null : number(view.inventoryMaxPrice);
    const fromDate = view.inventoryDate ? new Date(`${view.inventoryDate}T00:00:00`) : null;
    const toDate = view.inventoryDate ? new Date(`${view.inventoryDate}T23:59:59`) : null;
    const products = store.search(view.inventoryQuery, { stock: view.inventoryStock, brand: view.inventoryBrand, condition: view.page === 'inventory' ? view.inventoryCondition : '' }).filter(product => {
      if (view.page !== 'inventory') return true;
      if (view.inventoryCapacity && product.capacity !== view.inventoryCapacity) return false;
      if (view.inventoryColor && product.color !== view.inventoryColor) return false;
      if (minimum !== null && product.price < minimum) return false;
      if (maximum !== null && product.price > maximum) return false;
      if (fromDate && (!product.purchaseDate || new Date(`${product.purchaseDate}T12:00:00`) < fromDate)) return false;
      if (toDate && product.purchaseDate && new Date(`${product.purchaseDate}T12:00:00`) > toDate) return false;
      return true;
    });
    const sorters = {
      novedad: releaseOrder,
      recent: (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
      name: (a, b) => productName(a).localeCompare(productName(b), 'es'),
      stockAsc: (a, b) => a.stock - b.stock,
      stockDesc: (a, b) => b.stock - a.stock,
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price
    };
    return products.sort(sorters[view.inventorySort] || releaseOrder);
  }

  /**
   * Orden comercial: primero los equipos (iPhone, iPad, Mac) del más nuevo al
   * más viejo y, dentro de la misma generación, el más altas gama primero.
   * Después, todo lo demás: cargadores, fundas, vidrios y accesorios.
   */
  function releaseGeneration(product) {
    const match = String(product?.model || '').match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function isMainDevice(product) {
    const category = String(product?.category || '').toLowerCase();
    return category === 'celulares' || category === 'tablets' || category === 'notebooks' || category === 'wearables';
  }

  function variantTier(product) {
    const model = String(product?.model || '').toLowerCase();
    if (/pro\s*max|ultra|max/.test(model)) return 0;
    if (/pro|plus/.test(model)) return 1;
    return 2;
  }

  const releaseOrder = (a, b) => {
    if (isMainDevice(a) !== isMainDevice(b)) return isMainDevice(a) ? -1 : 1;
    if (isMainDevice(a)) {
      const diff = releaseGeneration(b) - releaseGeneration(a);
      if (diff) return diff;
      const tier = variantTier(a) - variantTier(b);
      if (tier) return tier;
    }
    return productName(a).localeCompare(productName(b), 'es');
  };

  function renderInventoryFilters(count) {
    const brands = [...new Set(store.getProducts().map(product => product.brand))].sort();
    return `<div class="filter-bar"><div class="filter-search">${icon('search')}<input id="inventory-search" data-filter="inventoryQuery" value="${esc(view.inventoryQuery)}" placeholder="Buscar modelo, variante, IMEI o SKU…" /></div><div class="select-wrap"><select class="select" data-filter="inventoryBrand"><option value="">Todas las marcas</option>${brands.map(brand => `<option ${view.inventoryBrand === brand ? 'selected' : ''} value="${esc(brand)}">${esc(brand)}</option>`).join('')}</select></div><div class="select-wrap"><select class="select" data-filter="inventoryCondition"><option value="">Todas las condiciones</option>${C.conditions.map(item => `<option ${view.inventoryCondition === item ? 'selected' : ''} value="${esc(item)}">${esc(item)}</option>`).join('')}</select></div><div class="select-wrap"><select class="select" data-filter="inventoryCapacity"><option value="">Toda capacidad</option>${store.getState().capacities.map(item => `<option value="${esc(item)}" ${view.inventoryCapacity === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div><div class="select-wrap"><select class="select" data-filter="inventoryColor"><option value="">Todos los colores</option>${store.getState().colors.map(item => `<option value="${esc(item)}" ${view.inventoryColor === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div><div class="filter-search" style="max-width:145px;min-width:120px"><input type="number" min="0" data-filter="inventoryMinPrice" value="${esc(view.inventoryMinPrice)}" placeholder="Precio mín." aria-label="Precio mínimo"/></div><div class="filter-search" style="max-width:145px;min-width:120px"><input type="number" min="0" data-filter="inventoryMaxPrice" value="${esc(view.inventoryMaxPrice)}" placeholder="Precio máx." aria-label="Precio máximo"/></div><input class="input" type="date" data-filter="inventoryDate" value="${esc(view.inventoryDate)}" style="width:155px" aria-label="Fecha de ingreso"/><div class="select-wrap"><select class="select" data-filter="inventorySort"><option value="novedad" ${view.inventorySort === 'novedad' ? 'selected' : ''}>Novedades (más nuevo primero)</option><option value="recent" ${view.inventorySort === 'recent' ? 'selected' : ''}>Más recientes</option><option value="name" ${view.inventorySort === 'name' ? 'selected' : ''}>Nombre A–Z</option><option value="stockAsc" ${view.inventorySort === 'stockAsc' ? 'selected' : ''}>Stock: menor a mayor</option><option value="stockDesc" ${view.inventorySort === 'stockDesc' ? 'selected' : ''}>Stock: mayor a menor</option><option value="priceAsc" ${view.inventorySort === 'priceAsc' ? 'selected' : ''}>Precio: menor a mayor</option><option value="priceDesc" ${view.inventorySort === 'priceDesc' ? 'selected' : ''}>Precio: mayor a menor</option></select></div><button class="btn btn-secondary" data-action="clear-inventory-filters">${icon('refresh')} Limpiar</button><span class="filter-count">${count} producto${count === 1 ? '' : 's'}</span></div><div class="quick-filters"><button class="quick-filter ${!view.inventoryStock ? 'active' : ''}" data-action="set-stock-filter" data-stock="">Todos <span class="count">${store.getProducts().length}</span></button><button class="quick-filter ${view.inventoryStock === 'available' ? 'active' : ''}" data-action="set-stock-filter" data-stock="available">Con stock</button><button class="quick-filter ${view.inventoryStock === 'low' ? 'active' : ''}" data-action="set-stock-filter" data-stock="low">Bajo stock <span class="count">${store.getProducts().filter(product => product.stock > 0 && product.stock <= product.minStock).length}</span></button><button class="quick-filter ${view.inventoryStock === 'out' ? 'active' : ''}" data-action="set-stock-filter" data-stock="out">Sin stock <span class="count">${store.getProducts().filter(product => product.stock === 0).length}</span></button></div>`;
  }

  function renderProductRow(product) {
    const state = stockState(product);
    return `<tr><td><div class="product-cell">${productThumb(product)}<div><strong>${esc(productName(product))}</strong><span>${esc(product.condition)} · ${product.requiresImei ? 'Con IMEI' : 'Por cantidad'}</span></div></div></td><td><span style="color:var(--ink);font-size:11px">${esc(variantName(product))}</span><span class="sku" style="display:block;margin-top:3px">${esc(product.sku)}</span></td><td><span class="stock-number">${product.stock}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">mín. ${product.minStock}</span></td>${hasRole('Administrador', 'Inventario') ? `<td class="num price-cell">${money(product.cost)}</td>` : ''}<td class="num price-cell">${money(product.price)}</td>${hasRole('Administrador', 'Inventario') ? `<td class="num profit-cell">${money(profit(product))}<span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px;font-weight:500">${margin(product) === null ? '—' : margin(product).toFixed(1)}%</span></td>` : ''}<td>${statusPill(state.label, state.tone)}</td><td><div class="action-cell"><button class="table-action" data-action="product-detail" data-id="${product.id}" title="Ver ficha">${icon('eye')}</button>${hasRole('Administrador') ? `<button class="table-action" data-action="edit-product" data-id="${product.id}" title="Editar">${icon('edit')}</button>` : ''}${hasRole('Administrador', 'Inventario') ? `<button class="table-action" data-action="stock-product" data-id="${product.id}" title="Agregar stock">${icon('plus')}</button>` : ''}${hasRole('Administrador', 'Inventario') ? `<button class="table-action" data-action="subtract-product" data-id="${product.id}" title="Restar stock">${icon('minus')}</button>` : ''}${hasRole('Administrador', 'Vendedor') ? `<button class="table-action" data-action="sell-product" data-id="${product.id}" title="Vender">${icon('cart')}</button>` : ''}</div></td></tr>`;
  }

  function renderMobileProduct(product) {
    const state = stockState(product);
    return `<div class="mobile-product-card"><div class="mobile-product-head">${productThumb(product)}<div class="product-cell"><div><strong>${esc(productName(product))}</strong><span>${esc(variantName(product))} · ${esc(product.condition)}</span></div></div><div class="mobile-product-price">${money(product.price)}<small>${product.stock} en stock</small></div></div><div class="mobile-product-meta">${statusPill(state.label, state.tone)}${hasRole('Administrador', 'Inventario') ? `<span class="meta-item">Costo ${money(product.cost)}</span><span class="meta-item">Margen ${margin(product) === null ? '—' : margin(product).toFixed(0)}%</span>` : ''}<span class="meta-item">${esc(product.location)}</span></div><div class="mobile-product-actions"><button class="btn btn-secondary btn-sm" data-action="product-detail" data-id="${product.id}">${icon('eye')} Ver</button>${hasRole('Administrador', 'Inventario') ? `<button class="btn btn-soft-blue btn-sm" data-action="stock-product" data-id="${product.id}">${icon('plus')} Stock</button>` : ''}${hasRole('Administrador', 'Vendedor') ? `<button class="btn btn-soft-mint btn-sm" data-action="sell-product" data-id="${product.id}">${icon('cart')} Vender</button>` : ''}</div></div>`;
  }

  function renderProducts() {
    const products = filteredProducts();
    const catalogCount = C.iphoneModels.length;
    const content = `${pageHead('Catálogo maestro', 'Productos', 'Administrá variantes, precios, stock y equipos individualizados.', `<button class="btn btn-secondary" data-action="open-catalog">${icon('layers')} Catálogo iPhone</button>${hasRole('Administrador') ? `<button class="btn btn-secondary" data-action="open-import">${icon('upload')} Importar CSV</button>` : ''}${hasRole('Administrador') ? `<button class="btn btn-primary" data-action="open-product">${icon('plus')} Nuevo producto</button>` : ''}`)}<div class="detail-tabs" style="width:max-content;margin-bottom:18px"><button class="detail-tab ${view.productTab === 'list' ? 'active' : ''}" data-action="set-product-tab" data-tab="list">Mis productos <span style="color:#98a2b3;margin-left:3px">${store.getProducts().length}</span></button><button class="detail-tab ${view.productTab === 'catalog' ? 'active' : ''}" data-action="set-product-tab" data-tab="catalog">Catálogo inicial <span style="color:#98a2b3;margin-left:3px">${catalogCount}</span></button></div>${view.productTab === 'catalog' ? renderCatalog() : `<div class="filter-bar"><div class="filter-search">${icon('search')}<input id="product-search" data-filter="inventoryQuery" value="${esc(view.inventoryQuery)}" placeholder="Buscar en productos…" /></div><div class="select-wrap"><select class="select" data-filter="inventoryBrand"><option value="">Todas las marcas</option>${[...new Set(store.getProducts().map(product => product.brand))].map(brand => `<option ${view.inventoryBrand === brand ? 'selected' : ''} value="${esc(brand)}">${esc(brand)}</option>`).join('')}</select></div><span class="filter-count">${products.length} productos</span></div><div class="card table-card products-table-card">${products.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Producto</th><th>Variante</th><th>Stock</th>${hasRole('Administrador', 'Inventario') ? '<th class="num">Costo</th>' : ''}<th class="num">Precio venta</th>${hasRole('Administrador', 'Inventario') ? '<th class="num">Margen</th>' : ''}<th>Estado</th><th>Acciones</th></tr></thead><tbody>${products.map(renderProductRow).join('')}</tbody></table></div><div class="mobile-card-list">${products.map(renderMobileProduct).join('')}</div>` : emptyState('No hay productos', 'Cargá tu primer producto o explorá el catálogo inicial.', `${hasRole('Administrador') ? `<button class="btn btn-primary btn-sm" data-action="open-product">${icon('plus')} Nuevo producto</button>` : ''}`)}</div>`}`;
    return content;
  }

  function renderCatalog() {
    const groups = [
      ['Todos', C.iphoneModels],
      ['iPhone 18', C.iphoneModels.filter(model => model.name.startsWith('iPhone 18'))],
      ['iPhone 17', C.iphoneModels.filter(model => model.name.startsWith('iPhone 17'))],
      ['iPhone 16', C.iphoneModels.filter(model => model.name.startsWith('iPhone 16'))],
      ['iPhone 15', C.iphoneModels.filter(model => model.name.startsWith('iPhone 15'))],
      ['iPhone 14', C.iphoneModels.filter(model => model.name.startsWith('iPhone 14'))],
      ['iPhone 13', C.iphoneModels.filter(model => model.name.startsWith('iPhone 13'))],
      ['Modelos anteriores', C.iphoneModels.filter(model => /iPhone (12|11|XS|XR|X|8|7|6)/.test(model.name))]
    ];
    const activeGroup = view.catalogGroup || 'Todos';
    const activeModels = (groups.find(group => group[0] === activeGroup) || groups[0])[1];
    return `<div class="demo-strip">${icon('info')}<span>El catálogo es una base editable de <strong>${C.iphoneModels.length} modelos</strong>. No se asumen capacidades ni colores: cada modelo tiene sus variantes sugeridas y podés ajustarlas al cargar stock.</span></div><div class="quick-filters" style="margin-bottom:18px">${groups.map(([label]) => `<button class="quick-filter ${activeGroup === label ? 'active' : ''}" data-action="set-catalog-group" data-group="${esc(label)}">${esc(label)}</button>`).join('')}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${activeModels.map(model => { const hasProduct = store.getProducts().some(product => product.model === model.name); return `<div class="card" style="padding:15px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><span class="product-thumb">${icon('smartphone')}</span>${hasProduct ? statusPill('En catálogo', 'info') : statusPill('Disponible', 'neutral')}</div><h3 style="margin-top:13px;color:var(--navy);font-size:13px">${esc(model.name)}</h3><p style="margin-top:4px;color:var(--ink-faint);font-size:9px">${model.capacities.length} capacidades · ${model.colors.length} colores sugeridos</p><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:11px">${model.capacities.slice(0, 3).map(capacity => `<span class="detail-tag">${esc(capacity)}</span>`).join('')}${model.capacities.length > 3 ? `<span class="detail-tag">+${model.capacities.length - 3}</span>` : ''}</div>${hasRole('Administrador') ? `<button class="btn btn-soft-blue btn-sm btn-block" style="margin-top:14px" data-action="catalog-add" data-model="${esc(model.name)}">${icon('plus')} Cargar variante</button>` : ''}</div>`; }).join('')}</div>`;
  }

  /* Sales and purchases */
  function renderSales() {
    const allSales = [...store.getState().sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sales = allSales.filter(sale => { const customer = customerName(sale.customerId).toLowerCase(); const query = view.salesQuery.toLowerCase(); const matches = !query || sale.id.includes(query) || customer.includes(query) || sale.items.some(item => `${item.productName} ${item.variant || ''} ${item.imei || ''}`.toLowerCase().includes(query)); const payment = !view.salesFilter || sale.paymentMethod === view.salesFilter; return matches && payment; });
    const today = todayInput();
    const month = today.slice(0, 7);
    const daySales = allSales.filter(sale => sale.date.slice(0, 10) === today);
    const monthSales = allSales.filter(sale => sale.date.slice(0, 7) === month);
    const dayTotal = daySales.reduce((sum, sale) => sum + sale.total, 0);
    const monthTotal = monthSales.reduce((sum, sale) => sum + sale.total, 0);
    const monthProfit = hasRole('Administrador', 'Inventario') ? monthSales.reduce((sum, sale) => sum + sale.profit, 0) : null;
    return `${pageHead('Operaciones comerciales', 'Ventas', 'Registrá ventas en segundos y mantené las ganancias siempre actualizadas.', `<button class="btn btn-secondary" data-action="export" data-export="sales">${icon('download')} Exportar</button><button class="btn btn-primary" data-action="open-sale">${icon('plus')} Nueva venta</button>`)}<div class="metric-grid">${metricCard('Ventas de hoy', money(dayTotal), 'receipt', 'blue', '<span>Operaciones cobradas</span>')}${metricCard('Ventas del mes', money(monthTotal), 'cart', 'mint', `<span>${monthSales.length} ventas realizadas</span>`)}${metricCard('Ganancia del mes', hasRole('Administrador', 'Inventario') ? money(monthProfit) : 'No visible', 'trend', 'orange', hasRole('Administrador', 'Inventario') ? `<span>${monthTotal ? (monthProfit / monthTotal * 100).toFixed(1) : 0}% de margen</span>` : '<span>Datos protegidos por rol</span>')}${metricCard('Ticket promedio', money(monthSales.length ? monthTotal / monthSales.length : 0), 'wallet', 'purple', '<span>Por venta este mes</span>')}</div><div class="filter-bar"><div class="filter-search">${icon('search')}<input id="sales-search" data-filter="salesQuery" value="${esc(view.salesQuery)}" placeholder="Buscar venta, cliente, producto o IMEI…" /></div><div class="select-wrap"><select class="select" data-filter="salesFilter"><option value="">Todos los medios de pago</option>${store.getState().paymentMethods.map(item => `<option value="${esc(item)}" ${view.salesFilter === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div><button class="btn btn-secondary" data-action="export" data-export="sales">${icon('download')} CSV</button><span class="filter-count">${sales.length} venta${sales.length === 1 ? '' : 's'}</span></div><div class="card table-card">${sales.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Producto / unidades</th><th>Medio de pago</th><th class="num">Total</th>${hasRole('Administrador', 'Inventario') ? '<th class="num">Ganancia</th>' : ''}<th>Vendedor</th><th></th></tr></thead><tbody>${sales.map(renderSaleRow).join('')}</tbody></table></div>` : emptyState('No hay ventas para mostrar', 'Creá una venta con el botón Nueva venta.', `<button class="btn btn-primary btn-sm" data-action="open-sale">${icon('plus')} Nueva venta</button>`)}</div>`;
  }

  function renderSaleRow(sale) {
    const item = sale.items[0];
    return `<tr><td><span style="color:var(--ink);font-weight:700">#${esc(sale.id.replace('sal_', '').slice(-5).toUpperCase())}</span></td><td><span style="color:var(--ink);font-size:10px">${esc(dateTimeLabel(sale.date))}</span></td><td>${esc(sale.customerName || customerName(sale.customerId))}</td><td><span style="color:var(--ink)">${esc(item?.productName || '—')}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">${sale.items.length > 1 ? `${sale.items.length} productos` : `${item?.quantity || 1} unidad${item?.quantity === 1 ? '' : 'es'}${item?.imei ? ` · ${esc(item.imei.slice(-6))}` : ''}`}</span></td><td>${statusPill(sale.paymentMethod, sale.paymentStatus === 'Pagada' ? 'info' : 'warning')}</td><td class="num price-cell">${money(sale.total)}</td>${hasRole('Administrador', 'Inventario') ? `<td class="num profit-cell">${money(sale.profit)}</td>` : ''}<td>${esc(userName(sale.userId))}</td><td><button class="table-action" data-action="view-sale" data-id="${sale.id}" title="Ver detalle">${icon('eye')}</button></td></tr>`;
  }

  function renderPurchases() {
    const allPurchases = [...store.getState().purchases].sort((a, b) => new Date(b.date) - new Date(a.date));
    const purchases = allPurchases.filter(purchase => { const query = view.purchasesQuery.toLowerCase(); return !query || purchase.id.toLowerCase().includes(query) || purchase.supplierName.toLowerCase().includes(query) || purchase.items.some(item => item.productName.toLowerCase().includes(query)); });
    const total = allPurchases.reduce((sum, purchase) => sum + purchase.total, 0);
    const monthTotal = allPurchases.filter(purchase => purchase.date.slice(0, 7) === todayInput().slice(0, 7)).reduce((sum, purchase) => sum + purchase.total, 0);
    return `${pageHead('Recepción de mercadería', 'Compras', 'Registrá proveedores, costos y entradas de stock con trazabilidad.', `<button class="btn btn-secondary" data-action="export" data-export="purchases">${icon('download')} Exportar</button><button class="btn btn-primary" data-action="open-purchase">${icon('plus')} Nueva compra</button>`)}<div class="metric-grid">${metricCard('Total de compras', money(total), 'truck', 'blue', `<span>${allPurchases.length} compras registradas</span>`)}${metricCard('Compras este mes', money(monthTotal), 'calendar', 'orange', '<span>Flujo de caja</span>')}${metricCard('Proveedores activos', String(store.getState().suppliers.length), 'building', 'purple', '<span>En tu red</span>')}${metricCard('Ticket promedio', money(allPurchases.length ? total / allPurchases.length : 0), 'receipt', 'mint', '<span>Por orden de compra</span>')}</div><div class="filter-bar"><div class="filter-search">${icon('search')}<input id="purchases-search" data-filter="purchasesQuery" value="${esc(view.purchasesQuery)}" placeholder="Buscar proveedor o producto…" /></div><button class="btn btn-secondary" data-action="clear-purchases">${icon('refresh')} Limpiar</button><span class="filter-count">${purchases.length} compra${purchases.length === 1 ? '' : 's'}</span></div><div class="card table-card">${purchases.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Compra</th><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Pago</th><th class="num">Total</th><th></th></tr></thead><tbody>${purchases.map(renderPurchaseRow).join('')}</tbody></table></div>` : emptyState('Todavía no hay compras', 'Registrá una compra para actualizar tu stock.', `<button class="btn btn-primary btn-sm" data-action="open-purchase">${icon('plus')} Nueva compra</button>`)}</div>`;
  }

  function renderPurchaseRow(purchase) {
    return `<tr><td><span style="color:var(--ink);font-weight:700">#${esc(purchase.id.replace('pur_', '').slice(-5).toUpperCase())}</span></td><td>${esc(dateLabel(purchase.date))}</td><td><span style="color:var(--ink)">${esc(purchase.supplierName)}</span></td><td><span style="color:var(--ink)">${purchase.items.length} producto${purchase.items.length === 1 ? '' : 's'}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">${purchase.items.slice(0, 2).map(item => `${item.quantity}× ${esc(item.productName)}`).join(' · ')}${purchase.items.length > 2 ? '…' : ''}</span></td><td>${statusPill(purchase.paymentStatus, 'info')}</td><td class="num price-cell">${money(purchase.total)}</td><td><button class="table-action" data-action="view-purchase" data-id="${purchase.id}">${icon('eye')}</button></td></tr>`;
  }

  function renderMovements() {
    const movements = store.getState().movements.filter(movement => { const product = store.getProduct(movement.productId); const query = view.movementsQuery.toLowerCase(); return !query || (movement.imei || '').toLowerCase().includes(query) || (product ? `${product.brand} ${product.model} ${variantName(product)}`.toLowerCase().includes(query) : false) || movement.type.toLowerCase().includes(query); }).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 150);
    const entries = store.getState().movements.filter(item => item.quantity > 0).reduce((sum, item) => sum + item.quantity, 0);
    const exits = store.getState().movements.filter(item => item.quantity < 0).reduce((sum, item) => sum + Math.abs(item.quantity), 0);
    return `${pageHead('Trazabilidad', 'Movimientos', 'Historial completo de entradas, salidas y ajustes. No se borra el pasado.', `<button class="btn btn-secondary" data-action="export" data-export="movements">${icon('download')} Exportar CSV</button>`)}<div class="metric-grid">${metricCard('Unidades ingresadas', `+${entries}`, 'plus', 'mint', '<span>Entradas registradas</span>')}${metricCard('Unidades retiradas', `-${exits}`, 'minus', 'orange', '<span>Salidas y ventas</span>')}${metricCard('Movimientos totales', String(store.getState().movements.length), 'arrows', 'blue', '<span>Historial inmutable</span>')}${metricCard('Última operación', store.getState().movements[0] ? relativeDate(store.getState().movements[0].createdAt || store.getState().movements[0].date) : '—', 'clock', 'purple', '<span>Registro automático</span>')}</div><div class="filter-bar"><div class="filter-search">${icon('search')}<input id="movements-search" data-filter="movementsQuery" value="${esc(view.movementsQuery)}" placeholder="Buscar producto, IMEI o tipo de movimiento…" /></div><button class="btn btn-secondary" data-action="export" data-export="movements">${icon('download')} Exportar</button><span class="filter-count">Mostrando ${movements.length} movimientos</span></div><div class="card table-card">${movements.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Fecha / hora</th><th>Tipo</th><th>Producto</th><th>IMEI</th><th class="num">Cantidad</th><th class="num">Stock</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>${movements.map(movement => { const product = store.getProduct(movement.productId); const tone = movement.quantity > 0 ? 'success' : movement.type === 'Venta' ? 'info' : movement.type === 'Pérdida' ? 'danger' : 'warning'; return `<tr><td><span style="color:var(--ink);font-size:10px">${esc(dateTimeLabel(movement.date))}</span></td><td>${statusPill(movement.type, tone)}</td><td><span style="color:var(--ink)">${esc(product ? productName(product) : 'Producto eliminado')}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">${esc(product ? variantName(product) : '')}</span></td><td><span class="unit-imei">${esc(movement.imei || '—')}</span></td><td class="num"><span class="${movement.quantity > 0 ? 'profit-cell' : ''}" style="font-weight:700;color:${movement.quantity > 0 ? 'var(--mint)' : 'var(--red)'}">${movement.quantity > 0 ? '+' : ''}${movement.quantity}</span></td><td class="num"><span style="color:var(--ink-faint)">${movement.stockBefore} →</span> <strong style="color:var(--ink)">${movement.stockAfter}</strong></td><td>${esc(movement.reason || '—')}</td><td>${esc(userName(movement.userId))}</td></tr>`; }).join('')}</tbody></table></div>` : emptyState('Sin movimientos', 'Las operaciones de stock aparecerán acá automáticamente.')}</div>`;
  }

  /* People */
  function renderSuppliers() {
    const query = view.suppliersQuery.toLowerCase();
    const suppliers = store.getState().suppliers.filter(supplier => !query || `${supplier.name} ${supplier.company} ${supplier.taxId} ${supplier.email}`.toLowerCase().includes(query));
    return `${pageHead('Relaciones comerciales', 'Proveedores', 'Centralizá contactos, compras y condiciones de cada proveedor.', `<button class="btn btn-secondary" data-action="export" data-export="suppliers">${icon('download')} Exportar</button><button class="btn btn-primary" data-action="open-supplier">${icon('plus')} Nuevo proveedor</button>`)}<div class="filter-bar"><div class="filter-search">${icon('search')}<input id="suppliers-search" data-filter="suppliersQuery" value="${esc(view.suppliersQuery)}" placeholder="Buscar proveedor, empresa o CUIT…" /></div><span class="filter-count">${suppliers.length} proveedor${suppliers.length === 1 ? '' : 'es'}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:13px">${suppliers.length ? suppliers.map(supplier => { const purchases = store.getState().purchases.filter(purchase => purchase.supplierId === supplier.id); const total = purchases.reduce((sum, purchase) => sum + purchase.total, 0); return `<div class="card" style="padding:17px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div class="avatar" style="width:38px;height:38px;border-radius:11px;background:linear-gradient(145deg,#edf0ff,#dce4ff);color:#5570c5">${esc(initials(supplier.name))}</div>${statusPill('Activo', 'success')}</div><h3 style="margin-top:14px;color:var(--navy);font-size:14px">${esc(supplier.name)}</h3><p style="margin-top:3px;color:var(--ink-faint);font-size:10px">${esc(supplier.company || 'Sin empresa')}</p><div class="stat-strip" style="grid-template-columns:1fr 1fr;margin-top:15px"><div class="stat-box"><div class="stat-box-label">Total comprado</div><div class="stat-box-value blue" style="font-size:15px">${compactMoney(total)}</div></div><div class="stat-box"><div class="stat-box-label">Órdenes</div><div class="stat-box-value" style="font-size:15px">${purchases.length}</div></div></div><div style="display:flex;flex-direction:column;gap:7px;margin-top:14px;color:var(--ink-soft);font-size:10px">${supplier.phone ? `<span>${icon('smartphone')} ${esc(supplier.phone)}</span>` : ''}${supplier.email ? `<span>${icon('user')} ${esc(supplier.email)}</span>` : ''}</div><div style="display:flex;gap:7px;margin-top:15px"><button class="btn btn-secondary btn-sm" style="flex:1" data-action="view-supplier" data-id="${supplier.id}">${icon('eye')} Ver ficha</button><button class="btn btn-soft-blue btn-sm" data-action="open-purchase" data-id="${supplier.id}">${icon('cart')} Comprar</button></div></div>`; }).join('') : emptyState('No hay proveedores', 'Agregá al primer proveedor para conectar tus compras.')}</div>`;
  }

  function renderCustomers() {
    const query = view.customersQuery.toLowerCase();
    const customers = store.getState().customers.filter(customer => !query || `${customer.name} ${customer.taxId} ${customer.phone} ${customer.email}`.toLowerCase().includes(query));
    return `${pageHead('Relaciones comerciales', 'Clientes', 'conocé a tus clientes y tené un historial claro de cada compra.', `<button class="btn btn-secondary" data-action="export" data-export="customers">${icon('download')} Exportar</button><button class="btn btn-primary" data-action="open-customer">${icon('plus')} Nuevo cliente</button>`)}<div class="filter-bar"><div class="filter-search">${icon('search')}<input id="customers-search" data-filter="customersQuery" value="${esc(view.customersQuery)}" placeholder="Buscar por nombre, DNI o teléfono…" /></div><span class="filter-count">${customers.length} cliente${customers.length === 1 ? '' : 's'}</span></div><div class="card table-card">${customers.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th>Compras</th><th class="num">Total gastado</th><th>Última compra</th><th></th></tr></thead><tbody>${customers.map(customer => { const sales = store.getState().sales.filter(sale => sale.customerId === customer.id && sale.statusCode !== 'ANNULLED'); const total = sales.reduce((sum, sale) => sum + sale.total, 0); return `<tr><td><div class="product-cell"><span class="avatar" style="width:30px;height:30px;border-radius:9px;font-size:9px;background:#f0f3ff;color:#5870be">${esc(initials(customer.name))}</span><div><strong>${esc(customer.name)}</strong><span>Alta ${esc(dateLabel(customer.createdAt))}</span></div></div></td><td>${esc(customer.taxId || '—')}</td><td><span style="color:var(--ink)">${esc(customer.phone || customer.email || '—')}</span></td><td>${sales.length}</td><td class="num price-cell">${money(total)}</td><td>${sales[0] ? esc(dateLabel(sales[0].date)) : '—'}</td><td><button class="table-action" data-action="view-customer" data-id="${customer.id}">${icon('eye')}</button></td></tr>`; }).join('')}</tbody></table></div>` : emptyState('No hay clientes', 'Registrá un cliente para asociarlo a tus ventas.')}</div>`;
  }

  /* Reports */
  function renderReports() {
    const days = Number(view.reportRange) || 30;
    const dailySeries = store.getDailySeries(days);
    const series = days <= 30 ? dailySeries : Array.from({ length: Math.ceil(dailySeries.length / 7) }, (_, index) => {
      const bucket = dailySeries.slice(index * 7, index * 7 + 7);
      return { key: bucket[0]?.key || '', label: bucket[0]?.label || '', sales: bucket.reduce((sum, item) => sum + item.sales, 0), profit: bucket.reduce((sum, item) => sum + item.profit, 0), purchases: bucket.reduce((sum, item) => sum + item.purchases, 0) };
    });
    const salesInRange = store.getState().sales.filter(sale => new Date(sale.date) >= new Date(Date.now() - days * 86400000));
    const purchasesInRange = store.getState().purchases.filter(purchase => new Date(purchase.date) >= new Date(Date.now() - days * 86400000));
    const salesTotal = salesInRange.reduce((sum, sale) => sum + sale.total, 0);
    const profitTotal = salesInRange.reduce((sum, sale) => sum + sale.profit, 0);
    const purchaseTotal = purchasesInRange.reduce((sum, purchase) => sum + purchase.total, 0);
    const top = store.getTopProducts(6, days);
    const maxBar = Math.max(...series.map(item => Math.max(item.sales, item.profit)), 1);
    return `${pageHead('Análisis del negocio', 'Reportes', 'Convertí los datos de tu operación en decisiones simples y claras.', `<button class="btn btn-secondary" data-action="export" data-export="reports">${icon('download')} Exportar reporte</button><button class="btn btn-secondary" data-action="print">${icon('print')} Imprimir</button>`)}<div class="filter-bar"><span style="color:var(--ink-soft);font-size:11px;font-weight:700">Período</span><div class="period-tabs" style="display:flex;padding:3px;border:1px solid var(--line);border-radius:8px;width:max-content">${[[7, '7 días'], [30, '30 días'], [90, '90 días']].map(([value, label]) => `<button class="period-tab ${days === value ? 'active' : ''}" data-action="set-report-range" data-days="${value}">${label}</button>`).join('')}</div><span class="filter-count">Carga actual ${esc(relativeDate(new Date().toISOString()))}</span></div><div class="report-kpis" style="margin-bottom:18px"><div class="report-kpi"><span>Ventas netas del período</span><strong>${money(salesTotal)}</strong></div><div class="report-kpi"><span>Ganancia estimada</span><strong style="color:var(--mint)">${money(profitTotal)}</strong></div><div class="report-kpi"><span>Compras del período</span><strong style="color:var(--orange)">${money(purchaseTotal)}</strong></div></div><div class="report-grid"><div class="card wide report-chart"><div class="card-head"><div><h2 class="card-title">Ventas vs. ganancias</h2><p class="card-caption">Período de ${days} días · ${days > 30 ? 'agrupado por semana' : 'vista diaria'}</p></div><div class="legend"><span class="legend-item"><i class="legend-dot blue"></i> Ventas</span><span class="legend-item"><i class="legend-dot mint"></i> Ganancia</span></div></div><div class="card-body"><div class="report-bars">${series.map(item => `<div class="report-bar-group" title="${esc(item.label)} · Ventas ${money(item.sales)} · Ganancia ${money(item.profit)}"><span class="report-bar" style="height:${Math.max(3, item.sales / maxBar * 100)}%"></span><span class="report-bar profit" style="height:${Math.max(3, item.profit / maxBar * 100)}%"></span></div>`).join('')}</div><div class="report-bar-labels"><span>${esc(series[0]?.label || '')}</span><span>${esc(series[Math.floor(series.length / 2)]?.label || '')}</span><span>Hoy</span></div></div></div><div class="card report-chart"><div class="card-head"><div><h2 class="card-title">Productos por unidades</h2><p class="card-caption">Top del período</p></div></div><div class="ranking-list">${top.length ? top.map((item, index) => `<div class="ranking-item"><span class="${index < 3 ? 'rank-medal' : 'rank'}">${index + 1}</span><div class="product-mini"><strong>${esc(item.product ? productName(item.product) : 'Producto')}</strong><span>${esc(item.product ? variantName(item.product) : '')}</span></div><span class="rank-value">${item.quantity}</span></div>`).join('') : '<div class="empty-state" style="padding:25px 0">Sin datos</div>'}</div></div><div class="card report-chart"><div class="card-head"><div><h2 class="card-title">Capital y rentabilidad</h2><p class="card-caption">Snapshot de tu inventario</p></div></div><div class="card-body"><div class="stat-strip" style="grid-template-columns:1fr 1fr"><div class="stat-box"><div class="stat-box-label">Capital invertido</div><div class="stat-box-value">${money(store.getMetrics().stockValue)}</div></div><div class="stat-box"><div class="stat-box-label">Valor potencial</div><div class="stat-box-value blue">${money(store.getMetrics().retailValue)}</div></div><div class="stat-box"><div class="stat-box-label">Ganancia potencial</div><div class="stat-box-value mint">${money(store.getMetrics().potentialProfit)}</div></div><div class="stat-box"><div class="stat-box-label">Margen mínimo</div><div class="stat-box-value orange">${store.getSettings().minMargin}%</div></div></div></div></div><div class="card report-chart"><div class="card-head"><div><h2 class="card-title">Productos sin movimiento</h2><p class="card-caption">Considerá promo ozb resh</p></div></div><div class="alert-list">${store.getProducts().filter(product => !store.getState().sales.some(sale => sale.items.some(item => item.productId === product.id)) && product.stock > 0).slice(0, 5).map(product => `<div class="alert-row"><span class="alert-status low"></span><div class="alert-content"><strong>${esc(productName(product))}</strong><span>${product.stock} unidades · ${money(product.stock * product.cost)} inmovilizado</span></div><span class="alert-stock">${Math.max(1, Math.round((Date.now() - new Date(product.updatedAt).getTime()) / 86400000))} días</span></div>`).join('') || '<div class="empty-state" style="padding:20px 0">Todo tu stock tuvo movimiento.</div>'}</div></div></div>`;
  }

  /* Users and settings */
  function renderUsers() {
    const users = store.getState().users;
    return `${pageHead('Seguridad y equipo', 'Usuarios', 'Controlá quién puede operar el sistema y qué puede hacer.', `<button class="btn btn-secondary" data-action="export" data-export="users">${icon('download')} Exportar</button><button class="btn btn-primary" data-action="open-user">${icon('plus')} Nuevo usuario</button>`)}<div class="demo-strip">${icon('shield')}<span>Los permisos se aplican a cada operación. Las contraseñas se validan en el servidor con bcrypt, las sesiones usan cookies HttpOnly y cada operación queda asociada al usuario responsable.</span></div><div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Permisos principales</th><th></th></tr></thead><tbody>${users.map(user => `<tr><td><div class="product-cell"><span class="avatar" style="width:31px;height:31px;border-radius:9px;font-size:9px">${esc(user.avatar || initials(user.name))}</span><div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div></div></td><td>${statusPill(user.role, user.role === 'Administrador' ? 'purple' : user.role === 'Inventario' ? 'info' : 'success')}</td><td>${statusPill(user.active ? 'Activo' : 'Inactivo', user.active ? 'success' : 'neutral')}</td><td>${esc(user.lastLogin ? relativeDate(user.lastLogin) : 'Nunca')}</td><td><span style="color:var(--ink-soft);font-size:10px">${user.role === 'Administrador' ? 'Acceso total' : user.role === 'Vendedor' ? 'Ventas · stock · clientes' : 'Stock · compras · inventario'}</span></td><td><button class="table-action" data-action="open-user" data-id="${user.id}">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div></div><div class="card" style="margin-top:18px;padding:21px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px"><div><h2 class="card-title">Roles y permisos</h2><p class="card-caption">Permisos aplicados y validados en el backend</p></div>${statusPill('3 roles', 'info')}</div><div class="permission-grid">${[['Administrador', 'Control total del negocio', ['Acceso total', 'Usuarios y configuración', 'Backup y auditoría']], ['Vendedor', 'Operación de mostrador', ['Consultar inventario', 'Registrar ventas', 'Gestionar clientes']], ['Inventario', 'Control de mercadería', ['Agregar y restar stock', 'Registrar compras', 'Consultar inventario']]].map(([role, description, perms]) => `<div class="permission-card"><h3>${role}</h3><p>${description}</p><ul>${perms.map(perm => `<li>${icon('check')} ${perm}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
  }

  function renderSettings() {
    const settings = store.getSettings();
    const tabs = [['general', 'General', 'settings'], ['catalog', 'Catálogo', 'layers'], ['payments', 'Métodos de pago', 'wallet'], ['inventory', 'Verificar inventario', 'check'], ['backup', 'Backup y datos', 'database'], ['audit', 'Auditoría', 'shield']];
    let section = '';
    if (view.settingsTab === 'general') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Preferencias del negocio</h2><p>Configuración principal de NEXO Stock.</p></div><div class="form-grid"><div class="field"><label class="field-label" for="setting-business">Nombre del negocio</label><input class="input" id="setting-business" value="${esc(settings.businessName)}" /></div><div class="field"><label class="field-label" for="setting-legal">Razón social</label><input class="input" id="setting-legal" value="${esc(settings.legalName || '')}" /></div><div class="field"><label class="field-label" for="setting-location">Ubicación principal</label><input class="input" id="setting-location" value="${esc(settings.locationName || 'Córdoba Capital')}" /></div><div class="field"><label class="field-label" for="setting-currency">Moneda</label><select class="field-select" id="setting-currency"><option value="USD" selected>USD · Dólar estadounidense</option></select><div class="field-hint">La moneda principal es USD. No se realiza conversión automática.</div></div><div class="field"><label class="field-label" for="setting-margin">Margen mínimo <span class="optional">%</span></label><input class="input" id="setting-margin" type="number" min="0" max="100" value="${settings.minMargin}" /></div><div class="field"><label class="field-label" for="setting-capital">Capital invertido</label><div class="input-group"><input class="input" id="setting-capital" type="number" min="0" step="0.01" value="${esc(settings.investedCapital ?? 0)}" placeholder="0" /><span class="input-addon">${esc(settings.currency)}</span></div><div class="field-hint">Cuánto dinero invertiste en el negocio. Sirve para medir la rentabilidad sobre lo invertido.</div></div><div class="field"><label class="field-label" for="setting-min-stock">Stock mínimo predeterminado</label><input class="input" id="setting-min-stock" type="number" min="0" value="${settings.defaultMinStock}" /></div><div class="field"><label class="field-label" for="setting-tax">Impuesto <span class="optional">%</span></label><input class="input" id="setting-tax" type="number" min="0" max="100" value="${settings.taxRate}" /></div></div><div class="form-divider"></div><div class="setting-line"><div class="setting-line-copy"><strong>Alertas de stock bajo</strong><span>Mostrar avisos cuando el stock llegue al mínimo configurado.</span></div><div class="setting-line-control"><label class="toggle"><input type="checkbox" id="setting-alerts" ${settings.lowStockNotifications ? 'checked' : ''}/><span class="toggle-track"></span></label></div></div><div class="setting-line"><div class="setting-line-copy"><strong>Integridad de stock</strong><span>El stock negativo está bloqueado por la base y las validaciones del servidor.</span></div><div class="setting-line-control"><label class="toggle"><input type="checkbox" id="setting-negative" disabled/><span class="toggle-track"></span></label></div></div><div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" data-action="save-settings">${icon('check')} Guardar cambios</button></div></div>`;
    if (view.settingsTab === 'catalog') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Opciones reutilizables</h2><p>Estas listas alimentan los formularios y pueden crecer sin tocar la lógica.</p></div><div class="form-grid"><div class="field"><label class="field-label">Marcas</label><div class="detail-tags">${settings.brands.map(brand => `<span class="detail-tag">${esc(brand)} ${settings.brands.length > 1 ? `<button class="table-action" style="width:15px;height:15px" data-action="remove-setting-item" data-key="brands" data-value="${esc(brand)}">×</button>` : ''}</span>`).join('')}</div></div><div class="field"><label class="field-label">Capacidades</label><div class="detail-tags">${settings.capacities.map(capacity => `<span class="detail-tag">${esc(capacity)}</span>`).join('')}</div></div><div class="field"><label class="field-label">Colores</label><div class="detail-tags">${settings.colors.slice(0, 13).map(color => `<span class="detail-tag">${esc(color)}</span>`).join('')}</div></div><div class="field"><label class="field-label">Ubicaciones</label><div class="detail-tags">${settings.locations.map(location => `<span class="detail-tag">${esc(location)}</span>`).join('')}</div></div></div><div class="form-note" style="margin-top:17px">${icon('info')} El catálogo inicial incluye ${C.iphoneModels.length} modelos de iPhone y ${C.capacities.length} capacidades. No se hardcodean precios: los cargás por variante.</div><div style="display:flex;gap:8px;margin-top:17px"><button class="btn btn-soft-blue" data-action="open-catalog">${icon('layers')} Ver catálogo iPhone</button><button class="btn btn-secondary" data-action="open-setting-add" data-key="colors">${icon('plus')} Agregar color</button></div></div>`;
    if (view.settingsTab === 'payments') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Medios de pago</h2><p>Se utilizan al registrar ventas y compras.</p></div>${settings.paymentMethods.map(method => `<div class="setting-line"><div class="setting-line-copy"><strong>${icon(method === 'Efectivo' ? 'wallet' : 'receipt')} ${esc(method)}</strong><span>Disponible para nuevas operaciones.</span></div><div class="setting-line-control">${statusPill('Activo', 'success')}</div></div>`).join('')}<button class="btn btn-soft-blue" style="margin-top:16px" data-action="open-setting-add" data-key="paymentMethods">${icon('plus')} Agregar medio de pago</button></div>`;
    if (view.settingsTab === 'inventory') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Verificar inventario</h2><p>Compara el stock registrado con las unidades físicas o IMEI disponibles.</p></div><div class="form-note warning">${icon('alert')} Esta herramienta sólo informa. No modifica el inventario hasta que el administrador confirme un ajuste.</div><button class="btn btn-primary" style="margin-top:15px" data-action="run-reconciliation">${icon('refresh')} Ejecutar verificación</button><div id="reconciliation-result" style="margin-top:15px"></div></div>`;
    if (view.settingsTab === 'backup') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Backup y datos</h2><p>Tu base persistente puede exportarse y restaurarse en formato JSON.</p></div><div class="backup-card"><div class="backup-card-copy"><span class="backup-icon">${icon('database')}</span><div><strong>Último backup</strong><span>${esc(dateTimeLabel(settings.lastBackup))} · ${esc(relativeDate(settings.lastBackup))}</span></div></div><div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-soft-blue btn-sm" data-action="backup-export">${icon('download')} Exportar backup</button><button class="btn btn-secondary btn-sm" data-action="backup-import">${icon('upload')} Restaurar</button></div></div><div class="form-note" style="margin-top:16px">${icon('shield')} El archivo incluye productos, unidades, ventas, compras, clientes, proveedores, movimientos y auditoría. Guardalo en un lugar seguro.</div><div class="form-divider"></div><div class="setting-line"><div class="setting-line-copy"><strong>Restablecer datos iniciales</strong><span>Elimina clientes, compras, ventas, unidades y actividad; conserva el catálogo con stock cero. Exportá un backup antes de continuar.</span></div><div class="setting-line-control"><button class="btn btn-danger btn-sm" data-action="reset-initial">${icon('refresh')} Restablecer</button></div></div></div>`;
    if (view.settingsTab === 'audit') section = `<div class="card settings-section"><div class="settings-section-head"><h2>Auditoría</h2><p>Registro de quién hizo cada cambio y cuándo.</p></div><div class="table-scroll"><table class="data-table" style="min-width:650px"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead><tbody>${store.getState().auditLogs.slice(0, 30).map(log => `<tr><td>${esc(dateTimeLabel(log.createdAt))}</td><td>${esc(userName(log.userId))}</td><td><span style="color:var(--ink);font-weight:700">${esc(log.action)}</span></td><td>${esc(log.before || '—')}</td><td>${esc(log.after || '—')}</td></tr>`).join('')}</tbody></table></div></div>`;
    return `${pageHead('Preferencias del sistema', 'Configuración', 'Administrá tu negocio, catálogo, seguridad y datos.', `<button class="btn btn-secondary" data-action="show-shortcuts">${icon('help')} Atajos</button>`)}<div class="settings-layout"><div class="card settings-nav">${tabs.map(([id, label, iconName]) => `<button class="${view.settingsTab === id ? 'active' : ''}" data-action="open-settings-tab" data-tab="${id}">${icon(iconName)} ${label}</button>`).join('')}</div><div>${section}</div></div>`;
  }

  /* Modal templates */
  function modalFrame({ title, subtitle, body, footer, size = '', kicker = 'NEXO STOCK' }) {
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal ${size}" role="dialog" aria-modal="true" data-modal-content><div class="modal-header"><div class="modal-title-wrap"><div class="modal-kicker">${esc(kicker)}</div><div class="modal-title">${esc(title)}</div>${subtitle ? `<div class="modal-subtitle">${esc(subtitle)}</div>` : ''}</div><button class="modal-close" data-action="close-modal" aria-label="Cerrar">${icon('x')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</div></div>`;
  }

  let lastFocusedElement = null;
  function openModal(html) { lastFocusedElement = document.activeElement; modalRoot.innerHTML = html; document.body.classList.add('modal-open'); app.inert = true; const first = modalRoot.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary'); if (first) setTimeout(() => first.focus(), 40); }
  function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); app.inert = false; if (lastFocusedElement?.isConnected) lastFocusedElement.focus(); lastFocusedElement = null; }

  function productForm(product = {}, parentId = '') {
    const isEdit = Boolean(product.id && !parentId);
    const model = product.model || '';
    const brand = product.brand || 'Apple';
    const capacity = product.capacity || '';
    const color = product.color || '';
    const modelList = brand === 'Apple' ? C.iphoneModels.map(item => item.name) : [];
    const body = `<form id="product-form" data-id="${esc(product.id || '')}" data-parent-id="${esc(parentId || '')}"><div class="form-section-title">Identificación</div><div class="form-grid"><div class="field"><label class="field-label">Marca *</label><select class="field-select" name="brand" required>${options(store.getState().brands, brand)}</select></div><div class="field"><label class="field-label">Modelo *</label><input class="input" name="model" required value="${esc(model)}" list="model-list" placeholder="Ej. iPhone 17 Pro Max"/><datalist id="model-list">${modelList.map(item => `<option value="${esc(item)}"></option>`).join('')}</datalist></div><div class="field"><label class="field-label">Capacidad</label><select class="field-select" name="capacity"><option value="">Sin capacidad</option>${store.getState().capacities.map(item => `<option ${capacity === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div><div class="field"><label class="field-label">Color</label><select class="field-select" name="color"><option value="">Seleccionar</option>${store.getState().colors.concat(['Grafito', 'Dorado', 'Oro', 'Plata', 'Medianoche', 'Gris espacio']).filter((item, index, list) => list.indexOf(item) === index).map(item => `<option ${color === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div><div class="field"><label class="field-label">Variante <span class="optional">Opcional</span></label><input class="input" name="variant" value="${esc(product.variant || '')}" placeholder="Se genera automáticamente si la dejás vacía"/></div><div class="field"><label class="field-label">SKU / Código interno</label><input class="input" name="sku" value="${esc(product.sku || '')}" placeholder="Se genera automáticamente"/></div><div class="field"><label class="field-label">Código de barras</label><input class="input" name="barcode" value="${esc(product.barcode || '')}" placeholder="Opcional"/></div><div class="field"><label class="field-label">Categoría</label><select class="field-select" name="category">${options(store.getState().categories, product.category || 'Celulares')}</select></div></div><div class="form-divider"></div><div class="form-section-title">Precios y control</div><div class="form-grid four"><div class="field"><label class="field-label">Costo de compra <span class="optional">USD</span></label><div class="input-group"><input class="input" type="number" name="cost" min="0" step="0.01" value="${esc(product.cost ?? '')}"/><span class="input-addon">${esc(store.getSettings().currency)}</span></div></div><div class="field"><label class="field-label">Precio de venta <span class="optional">USD</span></label><div class="input-group"><input class="input" type="number" name="price" min="0" step="0.01" value="${esc(product.price ?? '')}"/><span class="input-addon">${esc(store.getSettings().currency)}</span></div></div><div class="field"><label class="field-label">Precio promo <span class="optional">Opcional</span></label><div class="input-group"><input class="input" type="number" name="promoPrice" min="0" step="1" value="${esc(product.promoPrice || '')}"/><span class="input-addon">${esc(store.getSettings().currency)}</span></div></div><div class="field"><label class="field-label">Precio oficial Apple <span class="optional">USD, referencia</span></label><input class="input" type="number" name="appleOfficialPriceUsd" min="0" step="0.01" value="${esc(product.appleOfficialPriceUsd ?? '')}" placeholder="No disponible"/></div><div class="field"><label class="field-label">Fuente precio Apple</label><input class="input" name="applePriceSource" value="${esc(product.applePriceSource || '')}" placeholder="Apple.com / Apple Store"/></div><div class="field"><label class="checkbox-row"><input class="checkbox" type="checkbox" name="costRegistered" ${product.costKnown ? 'checked' : ''}/><label>Costo registrado</label></label></div><div class="field"><label class="checkbox-row"><input class="checkbox" type="checkbox" name="salePriceRegistered" ${product.salePriceKnown ? 'checked' : ''}/><label>Precio de venta registrado</label></label></div><div class="field"><label class="field-label">Stock mínimo</label><input class="input" type="number" name="minStock" min="0" step="1" value="${esc(product.minStock ?? store.getSettings().defaultMinStock)}"/></div></div><div class="form-divider"></div><div class="form-section-title">Unidad y ubicación</div><div class="form-grid three"><div class="field"><label class="field-label">Control por IMEI</label><div class="checkbox-row"><input class="checkbox" type="checkbox" name="requiresImei" ${product.requiresImei !== false ? 'checked' : ''} ${isEdit && product.stock > 0 ? 'disabled' : ''}/><label>Cada equipo tiene un IMEI individual${isEdit && product.stock > 0 ? ' (bloqueado mientras tenga stock)' : ''}</label></div></div><div class="field"><label class="field-label">Condición</label><select class="field-select" name="condition">${options(C.conditions, product.condition || 'Nuevo')}</select></div><div class="field"><label class="field-label">Estado físico</label><select class="field-select" name="physicalState">${options(C.physicalStates, product.physicalState || '10/10')}</select></div><div class="field"><label class="field-label">Precio de venta${product?.price ? ' (actual)' : ''}</label><div class="input-group"><input class="input" type="number" name="salePrice" min="0" step="0.01" placeholder="${product?.price != null ? product.price : 'Ej. 1200'}" value=""/><span class="input-addon">${esc(store.getSettings().currency)}</span></div><div class="field-hint">Dejalo vacío si todavía no definiste el precio.</div></div><div class="field"><label class="field-label">Proveedor</label><select class="field-select" name="supplierId">${options(store.getState().suppliers.map(item => ({ value: item.id, label: item.name })), product.supplierId || '')}</select></div><div class="field"><label class="field-label">Ubicación</label><select class="field-select" name="location">${options(store.getState().locations, product.location || 'Local')}</select></div><div class="field"><label class="field-label">Fecha de compra</label><input class="input" type="date" name="purchaseDate" value="${esc((product.purchaseDate || todayInput()))}"/></div><div class="field"><label class="field-label">Garantía</label><input class="input" name="warranty" value="${esc(product.warranty || '')}" placeholder="Ej. 12 meses"/></div></div><div class="field" style="margin-top:15px"><label class="field-label">Notas internas</label><textarea class="textarea" name="notes" placeholder="Observaciones, condiciones de la batería, accesorios incluidos…">${esc(product.notes || '')}</textarea></div><div class="form-divider"></div><div class="form-note">${icon('info')} El stock se inicializa en 0 al crear el producto. Usá <strong>Agregar stock</strong> para crear la primera entrada y sus movimientos.</div><div id="product-margin-hint" class="form-note" style="display:none;margin-top:10px"></div><div id="product-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="product-form">${icon('check')} ${isEdit ? 'Guardar cambios' : 'Crear producto'}</button>`;
    openModal(modalFrame({ title: isEdit ? 'Editar producto' : 'Nuevo producto', subtitle: isEdit ? `${productName(product)} · ${variantName(product)}` : 'Creá una variante y completá sus datos.', body, footer, size: 'large', kicker: isEdit ? 'CATÁLOGO' : 'NUEVO PRODUCTO' }));
    updateProductMarginHint();
  }

  function updateProductMarginHint() {
    const form = document.getElementById('product-form');
    const hint = document.getElementById('product-margin-hint');
    if (!form || !hint) return;
    const cost = Number(form.elements.cost?.value || 0);
    const price = Number(form.elements.price?.value || 0);
    if (!(price > 0) || !Number.isFinite(cost)) { hint.style.display = 'none'; return; }
    const currentMargin = ((price - cost) / price) * 100;
    const minimum = number(store.getSettings().minMargin);
    const low = currentMargin < minimum;
    hint.style.display = 'block';
    hint.className = `form-note ${low ? 'danger' : 'warning'}`;
    hint.innerHTML = `${icon(low ? 'alert' : 'info')} Margen calculado: <strong>${currentMargin.toFixed(1)}%</strong>. Mínimo configurado: ${minimum}%.${low ? ' El servidor rechazará el precio por debajo del mínimo.' : ''}`;
  }

  function stockForm(productId = '') {
    const products = store.getProducts().filter(product => product.stock >= 0);
    const product = store.getProduct(productId) || products[0];
    const body = `<form id="stock-form" data-id="${esc(product?.id || '')}"><div class="form-section-title">Ingreso de mercadería</div><div class="form-grid"><div class="field full"><label class="field-label">Buscar modelo *</label><div class="filter-search" style="min-width:0">${icon('search')}<input id="stock-product-search" placeholder="Escribí iPhone 16, AirPods, cargador…" autocomplete="off"/></div><div class="field-hint" id="stock-product-count">Escribí para filtrar. Si es un equipo con IMEI, pegá el número y lo encuentra solo.</div></div><div class="field full"><label class="field-label">Producto / variante *</label><select class="field-select" name="productId" id="stock-product-select" required><option value="">Seleccionar producto</option>${products.map(item => `<option value="${item.id}" ${item.id === product?.id ? 'selected' : ''}>${esc(productName(item))} · ${esc(variantName(item))} — ${item.stock} en stock</option>`).join('')}</select></div><div class="field"><label class="field-label">Cantidad *</label><input class="input" type="number" name="quantity" min="1" step="1" value="1" required/></div><div class="field"><label class="field-label">Costo unitario *</label><div class="input-group"><input class="input" type="number" name="unitCost" min="0" step="0.01" required value="${product?.cost != null ? esc(product.cost) : ''}"/><span class="input-addon">${esc(store.getSettings().currency)}</span></div></div><div class="field"><label class="field-label">Proveedor</label><select class="field-select" name="supplierId">${options(store.getState().suppliers.map(item => ({ value: item.id, label: item.name })), product?.supplierId || '')}</select></div><div class="field"><label class="field-label">Fecha de ingreso</label><input class="input" type="date" name="date" value="${todayInput()}"/></div><div class="field"><label class="field-label">Ubicación</label><select class="field-select" name="location">${options(store.getState().locations, product?.location || 'Local')}</select></div><div class="field"><label class="field-label">Motivo</label><select class="field-select" name="reason">${options(['Ingreso de stock', 'Compra a proveedor', 'Devolución de cliente', 'Reposición', 'Corrección de inventario'], 'Ingreso de stock')}</select></div></div><div id="imei-stock-fields" class="field" style="display:${product?.requiresImei ? 'block' : 'none'};margin-top:16px"><label class="field-label">IMEI por unidad * <span class="optional">uno por línea</span></label><textarea class="textarea" name="imeis" placeholder="990000000000001&#10;990000000000002" placeholder="Ingresá ${product?.stock >= 0 ? '1' : ''} IMEI de 15 dígitos"></textarea><div class="field-hint">IMEI ficticios de demostración: usá números de 15 dígitos. El sistema rechaza duplicados.</div></div><div class="field" style="margin-top:13px"><label class="field-label">Números de serie <span class="optional">Opcional, uno por línea</span></label><textarea class="textarea" name="serialNumbers" style="min-height:58px" placeholder="Opcional"></textarea></div><div class="field" style="margin-top:13px"><label class="field-label">Observaciones</label><textarea class="textarea" name="notes" placeholder="Detalle de la recepción…"></textarea></div><div id="stock-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="stock-form">${icon('check')} Confirmar ingreso</button>`;
    openModal(modalFrame({ title: 'Agregar stock', subtitle: 'Actualizá el inventario y generá un movimiento trazable.', body, footer, size: 'medium', kicker: 'ENTRADA DE STOCK' }));
  }

  function subtractForm(productId = '') {
    const products = store.getProducts().filter(product => product.stock > 0);
    const product = store.getProduct(productId) || products[0];
    const body = `<form id="subtract-form" data-id="${esc(product?.id || '')}"><div class="form-note warning" style="margin-bottom:16px">${icon('alert')} Esta operación descontará stock de forma permanente y quedará registrada en el historial.</div><div class="form-grid"><div class="field full"><label class="field-label">Buscar modelo *</label><div class="filter-search" style="min-width:0;margin-bottom:10px">${icon('search')}<input id="subtract-product-search" placeholder="Escribí el modelo…" autocomplete="off"/></div><div class="field-hint" id="subtract-product-count"></div><label class="field-label">Producto *</label><select class="field-select" name="productId" id="subtract-product-select" required><option value="">Seleccionar producto</option>${products.map(item => `<option value="${item.id}" ${item.id === product?.id ? 'selected' : ''}>${esc(productName(item))} · ${esc(variantName(item))} — ${item.stock} disponibles</option>`).join('')}</select></div><div class="field"><label class="field-label">Cantidad *</label><input class="input" type="number" name="quantity" min="1" step="1" value="1" required/></div><div class="field" id="subtract-units-field" style="display:${product?.requiresImei ? 'block' : 'none'}"><label class="field-label">Unidades / IMEI * <span class="optional">seleccioná ${product?.requiresImei ? product.stock : 0}</span></label><select class="field-select" id="subtract-unit-select" multiple size="5">${product?.requiresImei ? availableUnits(product.id).map(unit => `<option value="${unit.id}">${esc(unit.imei)}</option>`).join('') : ''}</select><div class="field-hint">La cantidad debe coincidir con las unidades seleccionadas.</div></div><div class="field"><label class="field-label">Tipo de salida *</label><select class="field-select" name="type">${options(['Pérdida', 'Rotura', 'Uso interno', 'Ajuste manual', 'Otro'], 'Pérdida')}</select></div><div class="field full"><label class="field-label">Motivo *</label><input class="input" name="reason" required placeholder="Describí el motivo de la salida…"/></div><div class="field full"><label class="field-label">Observaciones</label><textarea class="textarea" name="notes" placeholder="Detalle adicional…"></textarea></div></div><div id="subtract-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-danger" type="submit" form="subtract-form">${icon('minus')} Confirmar salida</button>`;
    openModal(modalFrame({ title: 'Restar stock', subtitle: 'Nunca se permite dejar el inventario en negativo.', body, footer, size: 'medium', kicker: 'SALIDA MANUAL' }));
    updateSubtractProductFields();
  }

  function updateSubtractProductFields() {
    const select = document.getElementById('subtract-product-select');
    if (!select) return;
    const product = store.getProduct(select.value);
    const field = document.getElementById('subtract-units-field');
    const units = document.getElementById('subtract-unit-select');
    if (!product || !product.requiresImei) { if (field) field.style.display = 'none'; if (units) units.innerHTML = ''; return; }
    if (field) field.style.display = 'block';
    if (units) units.innerHTML = availableUnits(product.id).map(unit => `<option value="${unit.id}">${esc(unit.imei)}</option>`).join('');
  }

  function saleModal() {
    if (!view.saleDraft) view.saleDraft = { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `sale-${Date.now()}` };
    const draft = view.saleDraft;
    const products = store.getProducts().filter(product => product.stock > 0);
    const selected = products[0];
    const cart = draft.items;
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const total = Math.max(0, subtotal - number(draft.discount));
    const body = `<form id="sale-form"><div class="form-section-title">Agregar producto a la venta</div><div class="form-grid three"><div class="field full"><label class="field-label">Buscar por producto o IMEI *</label><div class="filter-search" style="min-width:0">${icon('search')}<input id="sale-product-search" placeholder="Escribí modelo, variante o IMEI…" autocomplete="off"/></div></div><div class="field"><label class="field-label">Producto *</label><select class="field-select" name="productId" id="sale-product-select"><option value="">Seleccionar</option>${products.map(item => `<option value="${item.id}">${esc(productName(item))} · ${esc(variantName(item))} (${item.stock})</option>`).join('')}</select></div><div class="field"><label class="field-label">Cantidad *</label><input class="input" type="number" name="quantity" min="1" step="1" value="1" required/></div><div class="field"><label class="field-label">Precio unitario *</label><div class="input-group"><input class="input" type="number" name="price" min="1" step="1" required/></div></div></div><div id="sale-unit-field" class="field" style="display:none;margin-top:12px"><label class="field-label">Unidad / IMEI *</label><select class="field-select" name="unitId" id="sale-unit-select"></select></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-soft-blue btn-sm" data-action="sale-add-item">${icon('plus')} Agregar a la venta</button></div><div class="form-divider"></div><div class="form-section-title">Detalle de la venta <span style="color:#98a2b3;font:500 10px DM Sans">${cart.length ? `${cart.length} producto${cart.length === 1 ? '' : 's'}` : 'Sin productos'}</span></div>${cart.length ? `<div class="table-scroll"><table class="units-table" style="min-width:470px"><thead><tr><th>Producto</th><th>Precio</th><th class="num">Importe</th><th></th></tr></thead><tbody>${cart.map((item, index) => `<tr><td><span style="color:var(--ink);font-weight:700">${esc(item.productName)}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">${esc(item.variant)}${item.imei ? ` · ${esc(item.imei)}` : ''} · ${item.quantity} uds</span></td><td>${money(item.price)}</td><td class="num price-cell">${money(item.total)}</td><td><button type="button" class="table-action danger" data-action="sale-remove-item" data-index="${index}">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="form-note">${icon("info")} Buscá un producto o escribí un IMEI para agregarlo.</div>'}<div class="form-divider"></div><div class="form-section-title">Cobro y cliente</div><div class="form-grid three"><div class="field full"><label class="field-label">Seleccionar cliente</label><div class="filter-search" style="min-width:0"><span>${icon('search')}</span><input id="sale-customer-search" placeholder="Buscar por nombre, DNI o teléfono…" autocomplete="off"/></div><select class="field-select" name="customerId" id="sale-customer-select"><option value="">Cliente mostrador</option>${store.getState().customers.map(customer => `<option value="${customer.id}" data-search="${esc(`${customer.name} ${customer.taxId || ''} ${customer.phone || ''}`.toLowerCase())}" ${customer.id === draft.customerId ? 'selected' : ''}>${esc(customer.name)}${customer.taxId ? ` · ${esc(customer.taxId)}` : ''}</option>`).join('')}</select><button type="button" class="btn btn-soft-blue btn-sm" style="margin-top:8px" data-action="sale-new-customer">${icon('plus')} Nuevo cliente</button></div><div class="field"><label class="field-label">Medio de pago *</label><select class="field-select" name="paymentMethod">${options(store.getState().paymentMethods, draft.paymentMethod || 'Efectivo')}</select></div><div class="field"><label class="field-label">Descuento general <span class="optional">Opcional</span></label><input class="input" type="number" name="discount" min="0" step="1" value="${esc(draft.discount || 0)}"/></div><div class="field full"><label class="field-label">Observaciones</label><textarea class="textarea" name="notes" placeholder="Detalle de la venta, seña o condiciones…">${esc(draft.notes || '')}</textarea></div></div><div class="stat-strip" style="grid-template-columns:1fr 1fr;margin-top:17px"><div class="stat-box"><div class="stat-box-label">Total de venta</div><div class="stat-box-value blue">${money(total)}</div></div><div class="stat-box"><div class="stat-box-label">Unidades</div><div class="stat-box-value">${cart.reduce((sum, item) => sum + item.quantity, 0)}</div></div></div><div id="sale-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="sale-form">${icon('check')} Confirmar venta · ${money(total)}</button>`;
    openModal(modalFrame({ title: 'Nueva venta', subtitle: 'Buscá por modelo o IMEI. El stock se descuenta al confirmar.', body, footer, size: 'large', kicker: 'CAJA / VENTA' }));
    const select = document.getElementById('sale-product-select');
    if (select && selected) { select.value = selected.id; updateSaleProductFields(); }
    const customerSearch = document.getElementById('sale-customer-search');
    const customerSelect = document.getElementById('sale-customer-select');
    if (customerSearch && customerSelect) customerSearch.addEventListener('input', () => {
      const query = customerSearch.value.trim().toLowerCase();
      [...customerSelect.options].forEach(option => { option.hidden = Boolean(query) && !option.dataset.search?.includes(query); });
    });
  }

  function updateSaleProductFields() {
    const select = document.getElementById('sale-product-select');
    if (!select) return;
    const product = store.getProduct(select.value);
    const unitField = document.getElementById('sale-unit-field');
    const unitSelect = document.getElementById('sale-unit-select');
    const price = select.form.elements.price;
    const quantity = select.form.elements.quantity;
    if (price && (!price.value || price.dataset.auto === '1')) { price.value = product?.price || ''; price.dataset.auto = '1'; }
    if (quantity && product) { quantity.max = product.requiresImei ? 1 : product.stock; if (product.requiresImei) quantity.value = '1'; }
    if (!product || !product.requiresImei) { if (unitField) unitField.style.display = 'none'; if (unitSelect) unitSelect.innerHTML = ''; return; }
    const selectedUnitIds = new Set((view.saleDraft?.items || []).map(item => item.unitId).filter(Boolean));
    const units = availableUnits(product.id).filter(unit => !selectedUnitIds.has(unit.id));
    if (unitField) unitField.style.display = 'block';
    if (unitSelect) unitSelect.innerHTML = units.length ? units.map(unit => `<option value="${unit.id}">${esc(unit.imei)}${unit.serialNumber ? ` · ${esc(unit.serialNumber)}` : ''}</option>`).join('') : '<option value="">No hay unidades disponibles</option>';
  }

  function purchaseModal(supplierId = '') {
    if (!view.purchaseDraft) view.purchaseDraft = { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `purchase-${Date.now()}` };
    const draft = view.purchaseDraft;
    const products = store.getProducts();
    const total = draft.items.reduce((sum, item) => sum + item.total, 0);
    const body = `<form id="purchase-form" data-supplier="${esc(supplierId)}"><div class="form-grid four"><div class="field"><label class="field-label">Proveedor *</label><select class="field-select" name="supplierId" id="purchase-supplier" required>${options(store.getState().suppliers.map(item => ({ value: item.id, label: item.name })), draft.supplierId || supplierId)}</select></div><div class="field"><label class="field-label">Fecha de compra</label><input class="input" type="date" name="date" value="${esc(draft.date || todayInput())}"/></div><div class="field"><label class="field-label">Forma de pago</label><select class="field-select" name="paymentMethod">${options(store.getState().paymentMethods, draft.paymentMethod || 'Transferencia')}</select><div class="field"><label class="field-label">Estado del pago</label><select class="field-select" name="paymentStatus">${options(['Pagada', 'Parcial', 'Pendiente'], draft.paymentStatus || 'Pagada')}</select></div></div><div class="form-divider"></div><div class="form-section-title">Agregar producto</div><div class="form-grid four"><div class="field full"><label class="field-label">Producto *</label><select class="field-select" id="purchase-product-select"><option value="">Seleccionar producto</option>${products.map(item => `<option value="${item.id}">${esc(productName(item))} · ${esc(variantName(item))}</option>`).join('')}</select></div><div class="field"><label class="field-label">Cantidad *</label><input class="input" type="number" id="purchase-quantity" min="1" step="1" value="1"/></div><div class="field"><label class="field-label">Costo unitario *</label><input class="input" type="number" id="purchase-cost" min="1" step="1" placeholder="0"/></div><div class="field full"><label class="field-label">IMEI <span class="optional">si aplica, uno por línea</span></label><textarea class="textarea" id="purchase-imeis" style="min-height:58px" placeholder="990000000000001&#10;990000000000002"></textarea></div><div class="field full"><label class="field-label">Números de serie <span class="optional">uno por línea, si corresponden</span></label><textarea class="textarea" id="purchase-serials" style="min-height:58px" placeholder="DEMO-SN-0001&#10;DEMO-SN-0002"></textarea></div></div><div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-soft-blue btn-sm" data-action="purchase-add-item">${icon('plus')} Agregar producto</button></div><div class="form-divider"></div><div class="form-section-title">Detalle de compra <span style="color:#98a2b3;font:500 10px DM Sans">${draft.items.length} producto${draft.items.length === 1 ? '' : 's'}</span></div>${draft.items.length ? `<div class="table-scroll"><table class="units-table" style="min-width:500px"><thead><tr><th>Producto</th><th>Cantidad</th><th class="num">Costo</th><th class="num">Total</th><th></th></tr></thead><tbody>${draft.items.map((item, index) => `<tr><td><span style="color:var(--ink);font-weight:700">${esc(item.productName)}</span><span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:9px">${esc(item.variant)}</span></td><td>${item.quantity}</td><td>${money(item.unitCost)}</td><td class="num price-cell">${money(item.total)}</td><td><button type="button" class="table-action danger" data-action="purchase-remove-item" data-index="${index}">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="form-note">${icon("info")} Agregá al menos un producto para crear la compra.</div>'}<div class="form-note" style="margin-top:15px">${icon('shield')} La compra y el ingreso de stock se guardan juntos. Si un IMEI no es válido o está duplicado, no se confirma nada.</div><div class="form-divider"></div><div class="form-grid"><div class="field"><label class="field-label">Estado del pago</label><select class="field-select" name="paymentStatus">${options(['Pagada', 'Pendiente', 'Parcial'], 'Pagada')}</select></div><div class="field"><label class="field-label">Observaciones</label><input class="field-select" name="notes" placeholder="Nro. de factura, remito…"/></div></div><div class="stat-strip" style="grid-template-columns:1fr;margin-top:16px"><div class="stat-box"><div class="stat-box-label">Total de compra</div><div class="stat-box-value blue">${money(total)}</div></div></div><div id="purchase-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="purchase-form">${icon('check')} Confirmar compra</button>`;
    openModal(modalFrame({ title: 'Nueva compra', subtitle: 'Recibí mercadería y actualizá el inventario en una sola operación.', body, footer, size: 'large', kicker: 'RECEPCIÓN / COMPRA' }));
    const productSelect = document.getElementById('purchase-product-select');
    if (productSelect) productSelect.addEventListener('change', () => { const product = store.getProduct(productSelect.value); const cost = document.getElementById('purchase-cost'); if (product && cost && !cost.value) cost.value = product.cost; });
  }

  function personForm(type, item = {}, context = {}) {
    const isCustomer = type === 'customer';
    const isEdit = Boolean(item.id);
    const body = `<form id="person-form" data-type="${type}" data-id="${esc(item.id || '')}" data-context="${esc(context.returnToSale ? 'sale' : '')}"><div class="form-grid"><div class="field full"><label class="field-label">${isCustomer ? 'Nombre y apellido' : 'Nombre del proveedor'} *</label><input class="input" name="name" required value="${esc(item.name || '')}" placeholder="${isCustomer ? 'Ej. Juan Pérez' : 'Ej. Distribuidora Sur'}"/></div>${isCustomer ? '<div class="field"><label class="field-label">Nombre</label><input class="input" name="firstName" value="'+esc(item.firstName || '')+'" placeholder="Juan"/></div><div class="field"><label class="field-label">Apellido</label><input class="input" name="lastName" value="'+esc(item.lastName || '')+'" placeholder="Pérez"/></div>' : ''}<div class="field"><label class="field-label">${isCustomer ? 'DNI / CUIT' : 'Empresa'}</label><input class="input" name="${isCustomer ? 'taxId' : 'company'}" value="${esc(isCustomer ? item.taxId : item.company || '')}" placeholder="${isCustomer ? '32.123.456' : 'Razón social'}"/></div><div class="field"><label class="field-label">Teléfono</label><input class="input" name="phone" value="${esc(item.phone || '')}" placeholder="+54 11 0000-0000"/></div><div class="field"><label class="field-label">WhatsApp</label><input class="input" name="whatsapp" value="${esc(item.whatsapp || '')}" placeholder="+54 9 11 0000-0000"/></div><div class="field"><label class="field-label">Email</label><input class="input" type="email" name="email" value="${esc(item.email || '')}" placeholder="email@empresa.com"/></div><div class="field full"><label class="field-label">Dirección</label><input class="input" name="address" value="${esc(item.address || '')}" placeholder="Calle, localidad…"/></div><div class="field full"><label class="field-label">Observaciones</label><textarea class="textarea" name="notes" placeholder="Notas internas…">${esc(item.notes || '')}</textarea></div></div>${!isCustomer ? `<div class="field" style="margin-top:14px"><label class="field-label">CUIT / identificación fiscal</label><input class="input" name="taxId" value="${esc(item.taxId || '')}" placeholder="30-12345678-9"/></div>` : ''}<div id="person-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="person-form">${icon('check')} ${isEdit ? 'Guardar' : 'Crear'}</button>`;
    openModal(modalFrame({ title: isEdit ? `Editar ${isCustomer ? 'cliente' : 'proveedor'}` : `Nuevo ${isCustomer ? 'cliente' : 'proveedor'}`, subtitle: 'Datos de contacto y seguimiento.', body, footer, size: 'small', kicker: isCustomer ? 'CLIENTES' : 'PROVEEDORES' }));
  }

  function userForm(user = {}) {
    const isEdit = Boolean(user.id);
    const body = `<form id="user-form" data-id="${esc(user.id || '')}"><div class="form-grid"><div class="field full"><label class="field-label">Nombre y apellido *</label><input class="input" name="name" required value="${esc(user.name || '')}" placeholder="Ej. Ana Pérez"/></div><div class="field full"><label class="field-label">Email *</label><input class="input" type="email" name="email" required value="${esc(user.email || '')}" placeholder="usuario@nexo.com"/></div><div class="field"><label class="field-label">Rol *</label><select class="field-select" name="role">${options(['Administrador', 'Vendedor', 'Inventario'], user.role || 'Vendedor')}</select></div><div class="field"><label class="field-label">${isEdit ? 'Nueva contraseña' : 'Contraseña *'} <span class="optional">${isEdit ? 'Opcional' : '8+ caracteres'}</span></label><input class="input" type="password" name="password" ${isEdit ? '' : 'required'} placeholder="••••••••"/></div>${isEdit ? `<div class="field full"><div class="checkbox-row"><input class="checkbox" type="checkbox" name="active" id="user-active" ${user.active !== false ? 'checked' : ''}/><label for="user-active">Usuario activo</label></div></div>` : ''}</div><div class="form-note" style="margin-top:16px">${icon('lock')} Las contraseñas nunca se guardan en texto plano. Se utiliza bcrypt con salt y sesiones persistidas de forma segura.</div><div id="user-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="user-form">${icon('check')} ${isEdit ? 'Guardar usuario' : 'Crear usuario'}</button>`;
    openModal(modalFrame({ title: isEdit ? 'Editar usuario' : 'Nuevo usuario', subtitle: 'Asigná un rol para controlar los permisos.', body, footer, size: 'small', kicker: 'SEGURIDAD' }));
  }

  function productDetail(product) {
    const canSeeFinancials = hasRole('Administrador', 'Inventario');
    const units = store.getState().units.filter(unit => unit.productId === product.id);
    const available = units.filter(unit => unit.status === 'Disponible');
    const sold = units.filter(unit => unit.status === 'Vendido');
    const reserved = units.filter(unit => unit.status === 'Reservado');
    const body = `<div class="detail-layout"><div class="detail-product-hero"><div>${productThumb(product, 'detail-thumb')}</div><div class="product-info"><h3>${esc(productName(product))}</h3><p>${esc(variantName(product))}</p><div class="detail-tags">${statusPill(product.condition, product.condition === 'Nuevo' ? 'success' : 'info')}${product.requiresImei ? '<span class="detail-tag">IMEI individual</span>' : '<span class="detail-tag">Stock por cantidad</span>'}</div></div><div class="detail-price-row"><div><span>Precio de venta</span><strong style="display:block;color:var(--navy);font-family:'Space Grotesk';font-size:21px;margin-top:3px">${money(product.price)}</strong></div>${canSeeFinancials ? `<div style="text-align:right"><span>Ganancia unitaria</span><strong>${money(profit(product))}</strong><span style="display:block;margin-top:3px">${margin(product) === null ? '—' : margin(product).toFixed(1)}% margen</span></div>` : '<div style="text-align:right"><span>Estado</span><strong>Disponible para venta</strong></div>'}</div></div><div><div class="stat-strip"><div class="stat-box"><div class="stat-box-label">Stock físico</div><div class="stat-box-value blue">${product.stock}</div></div><div class="stat-box"><div class="stat-box-label">Stock mínimo</div><div class="stat-box-value orange">${product.minStock}</div></div><div class="stat-box"><div class="stat-box-label">Vendidas</div><div class="stat-box-value mint">${sold.length}</div></div><div class="stat-box"><div class="stat-box-label">Reservadas</div><div class="stat-box-value">${reserved.length}</div></div></div><div class="detail-tabs" style="margin-top:17px"><button class="detail-tab active">Unidades ${units.length ? `(${units.length})` : ''}</button></div>${product.requiresImei ? `<div class="units-wrap"><table class="units-table"><thead><tr><th>IMEI</th><th>Estado</th><th>Ingreso</th>${canSeeFinancials ? '<th>Costo</th>' : ''}<th>Ubicación</th></tr></thead><tbody>${units.length ? units.map(unit => `<tr><td><span class="unit-imei">${esc(unit.imei)}</span>${unit.serialNumber ? `<span style="display:block;margin-top:2px;color:var(--ink-faint);font-size:8px">SN ${esc(unit.serialNumber)}</span>` : ''}</td><td>${statusPill(unit.status, unit.status === 'Disponible' ? 'success' : unit.status === 'Vendido' ? 'info' : unit.status === 'Reservado' ? 'warning' : 'neutral')}${unit.status === 'Reservado' && store.getState().reservations.find(item => item.unitId === unit.id && item.status !== 'Cancelada') ? `<div style="margin-top:5px"><button class="btn btn-secondary btn-sm" data-action="release-reservation" data-id="${store.getState().reservations.find(item => item.unitId === unit.id && item.status !== 'Cancelada').id}">Liberar</button></div>` : ''}</td><td>${esc(dateLabel(unit.entryDate))}</td>${canSeeFinancials ? `<td>${money(unit.cost)}</td>` : ''}<td>${esc(unit.location || '—')}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:20px">Todavía no hay unidades con IMEI</td></tr>'}</tbody></table></div>` : `<div class="empty-state" style="padding:26px 10px"><div class="empty-state-icon" style="color:#b0784a;background:#fff3e5">${icon('package')}</div><strong>Producto por cantidad</strong><p>Este producto no requiere unidades físicas individualizadas.</p></div>`}</div></div></div>`;
    const reserveButton = hasRole('Administrador', 'Inventario') && product.requiresImei && available.length ? `<button class="btn btn-secondary" data-action="reserve-product" data-id="${available[0].id}">${icon('clock')} Reservar unidad</button>` : '';
    const footer = [
      hasRole('Administrador') ? `<button class="btn btn-secondary" data-action="edit-product" data-id="${product.id}">${icon('edit')} Editar</button>` : '',
      hasRole('Administrador') ? `<button class="btn btn-secondary" data-action="new-variant" data-parent-id="${product.productId}">${icon('plus')} Nueva variante</button>` : '',
      hasRole('Administrador') && product.stock === 0 ? `<button class="btn btn-secondary" data-action="archive-product" data-id="${product.id}">${icon('archive')} Archivar</button>` : '',
      hasRole('Administrador', 'Inventario') ? `<button class="btn btn-soft-orange" data-action="subtract-product" data-id="${product.id}">${icon('minus')} Restar</button>` : '',
      reserveButton,
      hasRole('Administrador', 'Inventario') ? `<button class="btn btn-soft-blue" data-action="stock-product" data-id="${product.id}">${icon('plus')} Agregar stock</button>` : '',
      hasRole('Administrador', 'Vendedor') ? `<button class="btn btn-primary" data-action="sell-product" data-id="${product.id}">${icon('cart')} Vender</button>` : ''
    ].filter(Boolean).join('');
    openModal(modalFrame({ title: 'Ficha de producto', subtitle: 'Vista completa de variante, precio y unidades.', body, footer, size: 'large', kicker: `SKU ${product.sku}` }));
  }

  function openReservation(unitId) {
    const unit = store.getUnit(unitId);
    if (!unit || unit.status !== 'Disponible') { showToast('error', 'Unidad no disponible', 'La unidad ya está reservada, vendida o retirada.'); return; }
    const product = store.getProduct(unit.productId);
    const body = `<form id="reservation-form" data-unit-id="${esc(unit.id)}"><div class="form-note" style="margin-bottom:16px">${icon('clock')} La unidad <strong class="unit-imei">${esc(unit.imei)}</strong> quedará bloqueada para evitar una venta accidental.</div><div class="form-grid"><div class="field full"><label class="field-label">Producto</label><div class="input" style="display:flex;align-items:center">${esc(product ? `${productName(product)} · ${variantName(product)}` : 'Producto')}</div></div><div class="field"><label class="field-label">Cliente *</label><select class="field-select" name="customerId" required><option value="">Seleccionar cliente</option>${store.getState().customers.map(customer => `<option value="${customer.id}">${esc(customer.name)}</option>`).join('')}</select></div><div class="field"><label class="field-label">Seña <span class="optional">Opcional</span></label><input class="input" type="number" name="deposit" min="0" step="1" value="0"/></div><div class="field"><label class="field-label">Vencimiento</label><input class="input" type="date" name="expiresAt" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}"/></div><div class="field full"><label class="field-label">Observaciones</label><textarea class="textarea" name="notes" placeholder="Condiciones de entrega…"></textarea></div></div><div id="reservation-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = '<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="reservation-form">' + icon('check') + ' Confirmar reserva</button>';
    openModal(modalFrame({ title: 'Reservar unidad', subtitle: 'Disponible → Reservada · sin descontar stock', body, footer, size: 'small', kicker: 'RESERVAS' }));
  }

  function saleDetail(sale) {
    const customer = store.getCustomer(sale.customerId);
    const body = `<div class="form-note" style="margin-bottom:15px">${icon('receipt')} Venta registrada por <strong>${esc(userName(sale.userId))}</strong> el ${esc(dateTimeLabel(sale.date))}.</div><div class="table-scroll"><table class="units-table" style="min-width:500px"><thead><tr><th>Producto</th><th>Unidad / IMEI</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${sale.items.map(item => `<tr><td><span style="color:var(--ink);font-weight:700">${esc(item.productName)}</span><span style="display:block;margin-top:3px;color:var(--ink-faint);font-size:9px">${esc(item.variant)} · ${item.quantity} uds</span></td><td><span class="unit-imei">${esc(item.imei || 'Sin IMEI')}</span></td><td>${money(item.price)}</td><td class="num price-cell">${money(item.total)}</td></tr>`).join('')}</tbody></table></div><div class="stat-strip" style="grid-template-columns:1fr 1fr 1fr;margin-top:17px"><div class="stat-box"><div class="stat-box-label">Total</div><div class="stat-box-value blue">${money(sale.total)}</div></div>${hasRole('Administrador', 'Inventario') ? `<div class="stat-box"><div class="stat-box-label">Ganancia</div><div class="stat-box-value mint">${money(sale.profit)}</div></div>` : ''}<div class="stat-box"><div class="stat-box-label">Pago</div><div class="stat-box-value" style="font-size:13px">${esc(sale.paymentMethod)}</div></div></div>${sale.notes ? `<div class="form-note" style="margin-top:15px">${icon('info')} ${esc(sale.notes)}</div>` : ''}`;
    const footer = `<button class="btn btn-secondary" data-action="close-modal">Cerrar</button>${sale.statusCode === 'ACTIVE' && hasRole('Administrador') ? `<button class="btn btn-soft-orange" data-action="annul-sale" data-id="${sale.id}">Anular venta</button>` : ''}${sale.statusCode === 'ACTIVE' ? `<button class="btn btn-soft-blue" data-action="open-return" data-id="${sale.id}">${icon('refresh')} Devolver</button>` : ''}`;
    openModal(modalFrame({ title: `Venta #${esc(sale.id.replace('sal_', '').slice(-5).toUpperCase())}`, subtitle: `${sale.customerName || customer?.name || 'Cliente mostrador'} · ${sale.status || 'ACTIVA'}`, body, footer, size: 'medium', kicker: 'DETALLE DE VENTA' }));
  }

  function returnModal(sale) {
    const body = `<form id="return-form" data-sale-id="${esc(sale.id)}"><div class="form-note warning" style="margin-bottom:15px">${icon('info')} Seleccioná las líneas a devolver. Las unidades con IMEI volverán a <strong>DISPONIBLE</strong> y quedarán fuera de la venta.</div><div class="table-scroll"><table class="units-table"><thead><tr><th></th><th>Producto</th><th>Variante / IMEI</th><th>Cantidad</th></tr></thead><tbody>${sale.items.map(item => `<tr><td><input class="checkbox" type="checkbox" name="saleItemId" value="${item.id}" ${item.imei ? '' : ''}/></td><td>${esc(item.productName)}</td><td>${esc(item.variant)}${item.imei ? ` · ${esc(item.imei)}` : ''}</td><td>${item.quantity}</td></tr>`).join('')}</tbody></table></div><div class="field" style="margin-top:15px"><label class="field-label">Motivo de devolución *</label><textarea class="textarea" name="reason" required placeholder="Describí el motivo…"></textarea></div><label class="checkbox-row" style="margin-top:12px"><input class="checkbox" type="checkbox" name="restocked" checked/><label>Devolver unidades al stock disponible</label></label><div id="return-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    openModal(modalFrame({ title: `Devolver venta #${esc(sale.id.slice(-5).toUpperCase())}`, subtitle: 'La devolución quedará registrada y no eliminará la venta original.', body, footer: '<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="return-form">Confirmar devolución</button>', size: 'medium', kicker: 'DEVOLUCIÓN' }));
  }

  function purchaseDetail(purchase) {
    const body = `<div class="form-note" style="margin-bottom:15px">${icon('truck')} Compra registrada con <strong>${esc(purchase.supplierName)}</strong> el ${esc(dateTimeLabel(purchase.date))}.</div><div class="table-scroll"><table class="units-table" style="min-width:500px"><thead><tr><th>Producto</th><th>Cantidad</th><th class="num">Costo</th><th class="num">Total</th></tr></thead><tbody>${purchase.items.map(item => `<tr><td><span style="color:var(--ink);font-weight:700">${esc(item.productName)}</span><span style="display:block;margin-top:3px;color:var(--ink-faint);font-size:9px">${esc(item.variant)}${item.imeis?.length ? ` · ${item.imeis.length} IMEI` : ''}</span></td><td>${item.quantity}</td><td>${money(item.unitCost)}</td><td class="num price-cell">${money(item.total)}</td></tr>`).join('')}</tbody></table></div><div class="stat-strip" style="grid-template-columns:1fr 1fr;margin-top:17px"><div class="stat-box"><div class="stat-box-label">Total</div><div class="stat-box-value blue">${money(purchase.total)}</div></div><div class="stat-box"><div class="stat-box-label">Estado</div><div class="stat-box-value" style="font-size:14px">${esc(purchase.paymentStatus)}</div></div></div>`;
    openModal(modalFrame({ title: `Compra #${esc(purchase.id.replace('pur_', '').slice(-5).toUpperCase())}`, subtitle: purchase.supplierName, body, footer: '<button class="btn btn-secondary" data-action="close-modal">Cerrar</button>', size: 'medium', kicker: 'DETALLE DE COMPRA' }));
  }

  function supplierDetail(supplier) {
    const purchases = store.getState().purchases.filter(purchase => purchase.supplierId === supplier.id);
    const total = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
    const body = `<div class="form-note" style="margin-bottom:16px">${icon('building')} <strong>${esc(supplier.company || 'Proveedor independiente')}</strong> · Alta ${esc(dateLabel(supplier.createdAt))}</div><div class="form-grid"><div class="field"><label class="field-label">CUIT</label><div class="input" style="display:flex;align-items:center">${esc(supplier.taxId || '—')}</div></div><div class="field"><label class="field-label">Teléfono</label><div class="input" style="display:flex;align-items:center">${esc(supplier.phone || '—')}</div></div><div class="field"><label class="field-label">WhatsApp</label><div class="input" style="display:flex;align-items:center">${esc(supplier.whatsapp || '—')}</div></div><div class="field"><label class="field-label">Email</label><div class="input" style="display:flex;align-items:center">${esc(supplier.email || '—')}</div></div><div class="field full"><label class="field-label">Dirección</label><div class="input" style="display:flex;align-items:center">${esc(supplier.address || '—')}</div></div></div><div class="form-divider"></div><div class="form-section-title">Historial de compras</div>${purchases.length ? purchases.map(purchase => `<div class="setting-line"><div class="setting-line-copy"><strong>#${esc(purchase.id.replace('pur_', '').slice(-5).toUpperCase())} · ${esc(dateLabel(purchase.date))}</strong><span>${purchase.items.length} producto${purchase.items.length === 1 ? '' : 's'} · ${esc(purchase.paymentStatus)}</span></div><div class="setting-line-control" style="color:var(--navy);font-weight:700;font-size:12px">${money(purchase.total)}</div></div>`).join('') : '<p style="color:var(--ink-faint);font-size:11px">Todavía no hay compras registradas.</p>'}<div class="stat-strip" style="grid-template-columns:1fr 1fr;margin-top:17px"><div class="stat-box"><div class="stat-box-label">Total comprado</div><div class="stat-box-value blue">${money(total)}</div></div><div class="stat-box"><div class="stat-box-label">Órdenes</div><div class="stat-box-value">${purchases.length}</div></div></div>`;
    openModal(modalFrame({ title: supplier.name, subtitle: 'Ficha de proveedor', body, footer: `<button class="btn btn-secondary" data-action="close-modal">Cerrar</button><button class="btn btn-secondary" data-action="open-supplier" data-id="${supplier.id}">${icon('edit')} Editar</button><button class="btn btn-primary" data-action="open-purchase" data-id="${supplier.id}">${icon('cart')} Nueva compra</button>`, size: 'medium', kicker: 'PROVEEDOR' }));
  }

  function customerDetail(customer) {
    const sales = store.getState().sales.filter(sale => sale.customerId === customer.id && sale.statusCode !== 'ANNULLED').sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = sales.reduce((sum, sale) => sum + sale.total, 0);
    const body = `<div class="form-note" style="margin-bottom:16px">${icon('user')} <strong>${esc(customer.name)}</strong> · Cliente desde ${esc(dateLabel(customer.createdAt))}</div><div class="form-grid"><div class="field"><label class="field-label">DNI / CUIT</label><div class="input" style="display:flex;align-items:center">${esc(customer.taxId || '—')}</div></div><div class="field"><label class="field-label">Teléfono</label><div class="input" style="display:flex;align-items:center">${esc(customer.phone || '—')}</div></div><div class="field"><label class="field-label">Email</label><div class="input" style="display:flex;align-items:center">${esc(customer.email || '—')}</div></div><div class="field"><label class="field-label">Dirección</label><div class="input" style="display:flex;align-items:center">${esc(customer.address || '—')}</div></div></div><div class="form-divider"></div><div class="form-section-title">Historial de compras</div>${sales.length ? sales.map(sale => `<div class="setting-line"><div class="setting-line-copy"><strong>Venta #${esc(sale.id.replace('sal_', '').slice(-5).toUpperCase())} · ${esc(dateLabel(sale.date))}</strong><span>${sale.items.map(item => esc(item.productName)).join(', ')} · ${esc(sale.paymentMethod)}</span></div><div class="setting-line-control" style="color:var(--navy);font-weight:700;font-size:12px">${money(sale.total)}</div></div>`).join('') : '<p style="color:var(--ink-faint);font-size:11px">Todavía no tiene compras registradas.</p>'}<div class="stat-strip" style="grid-template-columns:1fr 1fr;margin-top:17px"><div class="stat-box"><div class="stat-box-label">Total gastado</div><div class="stat-box-value blue">${money(total)}</div></div><div class="stat-box"><div class="stat-box-label">Compras</div><div class="stat-box-value">${sales.length}</div></div></div>`;
    openModal(modalFrame({ title: customer.name, subtitle: 'Ficha de cliente', body, footer: `<button class="btn btn-secondary" data-action="close-modal">Cerrar</button><button class="btn btn-secondary" data-action="open-customer" data-id="${customer.id}">${icon('edit')} Editar</button>`, size: 'medium', kicker: 'CLIENTE' }));
  }

  function searchModal(query = '') {
    const body = `<div class="filter-search" style="height:46px;margin-bottom:15px">${icon('search')}<input id="search-modal-input" value="${esc(query)}" placeholder="Modelo, marca, IMEI, SKU, proveedor o cliente…" autocomplete="off"/></div><div id="search-results">${query ? searchResultsMarkup(query) : searchIdleMarkup()}</div>`;

  function searchIdleMarkup() {
    return `<div class="empty-state" style="padding:22px 10px"><div class="empty-state-icon">${icon('search')}</div><strong>Buscá en todo tu sistema</strong><p>Productos por modelo o SKU, unidades por IMEI, clientes por nombre o DNI y proveedores.</p></div><div class="form-note">${icon('info')} Atajo global: <strong>Ctrl + K</strong>.</div>`;
  }

  /** Resultados de la búsqueda global. Se repinta en vivo sin cerrar el modal. */
  function searchResultsMarkup(query) {
    const results = store.search(query).slice(0, 8);
    const unitResults = store.getState().units.filter(unit => `${unit.imei} ${unit.serialNumber}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    const customerResults = canOpenPage('customers') ? store.getState().customers.filter(item => `${item.name} ${item.taxId} ${item.phone}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];
    const supplierResults = canOpenPage('suppliers') ? store.getState().suppliers.filter(item => `${item.name} ${item.company || ''} ${item.taxId || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];
    const kicker = (text) => `<div class="form-kicker" style="color:#98a2b3;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin:16px 0 8px">${text}</div>`;
    const nada = (text) => `<p style="color:var(--ink-faint);font-size:11px;padding:12px 0">${text}</p>`;
    return (results.length ? kicker('Productos') + results.map(product => `<button class="setting-line" style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer" data-action="search-product" data-id="${product.id}"><div class="setting-line-copy"><strong>${esc(productName(product))} · ${esc(variantName(product))}</strong><span>${esc(product.sku)} · ${product.stock} unidades · ${esc(product.location)}</span></div><span class="rank-value">${money(product.price)}</span></button>`).join('') : '')
      + (unitResults.length ? kicker('IMEI encontrados') + unitResults.map(unit => { const product = store.getProduct(unit.productId); return `<button class="setting-line" style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer" data-action="search-unit" data-id="${unit.id}"><div class="setting-line-copy"><strong class="unit-imei">${esc(unit.imei)}</strong><span>${esc(product ? productName(product) : '')} · ${esc(unit.status)}</span></div>${statusPill(unit.status, unit.status === 'Disponible' ? 'success' : 'warning')}</button>`; }).join('') : '')
      + (supplierResults.length ? kicker('Proveedores') + supplierResults.map(supplier => `<button class="setting-line" style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer" data-action="view-supplier" data-id="${supplier.id}"><div class="setting-line-copy"><strong>${esc(supplier.name)}</strong><span>${esc(supplier.company || supplier.taxId || 'Proveedor')}</span></div>${statusPill('Ver', 'info')}</button>`).join('') : '')
      + (customerResults.length ? kicker('Clientes') + customerResults.map(customer => `<button class="setting-line" style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer" data-action="search-customer" data-id="${customer.id}"><div class="setting-line-copy"><strong>${esc(customer.name)}</strong><span>${esc(customer.phone || customer.email || 'Sin contacto')}</span></div>${icon('right')}</button>`).join('') : '')
      + (!results.length && !unitResults.length && !customerResults.length && !supplierResults.length ? nada(`Sin resultados para "${esc(query)}".`) : '');
  }

    openModal(modalFrame({ title: 'Búsqueda global', subtitle: 'Encontrá productos, unidades y clientes en un solo lugar.', body, footer: '<button class="btn btn-secondary" data-action="close-modal">Cerrar</button>', size: 'medium', kicker: 'BÚSQUEDA' }));
    const input = document.getElementById('search-modal-input');
    // Sólo se repinta la lista de resultados: cerrar y reabrir el modal en cada
    // tecla hacía que el buscador se saliera al escribir una sola letra.
    if (input) {
      input.focus();
      if (query) input.setSelectionRange(query.length, query.length);
      input.addEventListener('input', event => {
        clearTimeout(input._timer);
        const value = event.target.value;
        input._timer = setTimeout(() => {
          const panel = document.getElementById('search-results');
          if (panel) panel.innerHTML = value.trim() ? searchResultsMarkup(value) : searchIdleMarkup();
        }, 160);
      });
    }
  }

  function showNotifications() {
    const metrics = store.getMetrics();
    const alerts = store.getProducts().filter(product => product.stock <= product.minStock).slice(0, 7);
    const body = `<div class="form-note warning" style="margin-bottom:15px">${icon('bell')} <strong>${metrics.lowStock} productos con stock bajo</strong> y ${metrics.outOfStock} sin stock. Revisá las alertas antes de tu próxima compra.</div>${alerts.length ? alerts.map(product => { const state = stockState(product); return `<div class="setting-line"><div class="setting-line-copy"><strong>${esc(productName(product))} · ${esc(variantName(product))}</strong><span>${state.tone === 'danger' ? 'Sin unidades disponibles' : `Quedan ${product.stock} de un mínimo de ${product.minStock}`} · ${esc(product.location)}</span></div>${hasRole('Administrador', 'Inventario') ? `<button class="btn btn-secondary btn-sm" data-action="stock-product" data-id="${product.id}">${icon('plus')} Reponer</button>` : ''}</div>`; }).join('') : '<p style="color:var(--ink-soft);font-size:11px">No hay alertas activas.</p>'}`;
    openModal(modalFrame({ title: 'Centro de alertas', subtitle: 'Stock bajo y unidades que requieren atención.', body, footer: '<button class="btn btn-secondary" data-action="close-modal">Cerrar</button>', size: 'small', kicker: 'NOTIFICACIONES' }));
  }

  function shortcutModal() {
    const rows = [['Ctrl + K', 'Búsqueda global'], ['Ctrl + N', 'Nueva venta'], ['Ctrl + I', 'Ir a inventario'], ['Ctrl + Enter', 'Confirmar operación'], ['Esc', 'Cerrar modal']];
    openModal(modalFrame({ title: 'Atajos de teclado', subtitle: 'Trabajá más rápido desde el teclado.', body: `<div>${rows.map(([key, label]) => `<div class="setting-line"><div class="setting-line-copy"><strong>${label}</strong></div><kbd style="padding:5px 8px;border:1px solid #dfe4ed;border-radius:6px;background:#f7f8fb;color:#56647a;font:600 10px ui-monospace,monospace">${key}</kbd></div>`).join('')}</div>`, footer: '<button class="btn btn-secondary" data-action="close-modal">Cerrar</button>', size: 'small', kicker: 'ATAJOS' }));
  }

  function settingAddModal(key) {
    const labels = { colors: 'Color', capacities: 'Capacidad', locations: 'Ubicación', brands: 'Marca', paymentMethods: 'Método de pago' };
    openModal(modalFrame({ title: `Agregar ${labels[key] || 'opción'}`, subtitle: 'La opción quedará disponible en los próximos formularios.', body: `<form id="setting-add-form" data-key="${key}"><div class="field"><label class="field-label">Valor *</label><input class="input" name="value" required placeholder="Ej. ${key === 'colors' ? 'Verde fluorescente' : key === 'capacities' ? '4TB' : 'Nuevo valor'}"/></div><div id="setting-add-error" class="field-error" style="display:none;margin-top:10px"></div></form>`, footer: '<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="setting-add-form">Agregar</button>', size: 'small', kicker: 'CATÁLOGO' }));
  }

  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let index = 0; index < String(text || '').length; index += 1) {
      const char = String(text)[index];
      if (char === '"' && String(text)[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
      if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && String(text)[index + 1] === '\n') index += 1; row.push(cell.trim()); if (row.some(value => value)) rows.push(row); row = []; cell = ''; continue; }
      cell += char;
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(value => value)) rows.push(row); }
    return rows;
  }

  function normalizeImportRows(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return { rows: [], errors: ['El CSV necesita un encabezado y al menos un producto.'] };
    const headers = rows[0].map(value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''));
    const index = names => headers.findIndex(header => names.includes(header));
    const brandIndex = index(['marca', 'brand']);
    const modelIndex = index(['modelo', 'model']);
    const capacityIndex = index(['capacidad', 'capacity']);
    const colorIndex = index(['color']);
    const costIndex = index(['costo', 'cost', 'costocompra']);
    const priceIndex = index(['venta', 'precio', 'price', 'preciodeventa']);
    const stockIndex = index(['stock', 'cantidad']);
    const minIndex = index(['stockminimo', 'minstock']);
    const imeiIndex = index(['imei', 'imeis']);
    const serialIndex = index(['numerodeserie', 'seriales', 'serial', 'serialnumber']);
    const skuIndex = index(['sku', 'codigo', 'codigointerno']);
    const errors = [];
    if (brandIndex < 0 || modelIndex < 0) errors.push('Faltan las columnas Marca y Modelo.');
    if (costIndex < 0 || priceIndex < 0) errors.push('Faltan las columnas Costo y Venta.');
    if (errors.length) return { rows: [], errors };

    const seenVariants = new Set(store.getProducts().map(product => [product.brand, product.model, product.capacity || '', product.color || ''].map(value => String(value || '').trim().toLowerCase()).join('|')));
    const seenSkus = new Set(store.getProducts().map(product => String(product.sku || '').trim().toUpperCase()).filter(Boolean));
    const seenImeis = new Set(store.getState().units.map(unit => String(unit.imei || '').toUpperCase()).filter(Boolean));
    const parsed = rows.slice(1).filter(values => values.some(value => String(value || '').trim())).map((values, rowIndex) => {
      const imeis = (values[imeiIndex] || '').split(/[;,|]/).map(value => value.replace(/\s/g, '').toUpperCase()).filter(Boolean);
      const serialNumbers = (values[serialIndex] || '').split(/[;,|]/).map(value => value.trim()).filter(Boolean);
      const item = {
        brand: (values[brandIndex] || '').trim(),
        model: (values[modelIndex] || '').trim(),
        capacity: (values[capacityIndex] || '').trim(),
        color: (values[colorIndex] || '').trim(),
        cost: Number(values[costIndex] || 0),
        price: Number(values[priceIndex] || 0),
        stock: Number(values[stockIndex] || 0),
        minStock: Number(values[minIndex] || 0),
        sku: (values[skuIndex] || '').trim(),
        imeis,
        serialNumbers,
        row: rowIndex + 2
      };
      item.requiresImei = imeis.length > 0;
      if (!item.brand || !item.model) errors.push(`Fila ${item.row}: completá marca y modelo.`);
      if (!Number.isFinite(item.cost) || item.cost < 0 || !Number.isFinite(item.price) || item.price <= 0) errors.push(`Fila ${item.row}: costo y precio de venta inválidos.`);
      if (!Number.isInteger(item.stock) || item.stock < 0) errors.push(`Fila ${item.row}: el stock debe ser un entero no negativo.`);
      if (Number.isFinite(item.price) && item.price > 0 && item.price > 0) {
        const itemMargin = ((item.price - item.cost) / item.price) * 100;
        if (itemMargin < number(store.getSettings().minMargin)) errors.push(`Fila ${item.row}: margen ${itemMargin.toFixed(1)}%, menor al mínimo configurado.`);
      }
      if (item.requiresImei && item.stock !== imeis.length) errors.push(`Fila ${item.row}: se requiere un IMEI por cada unidad de stock.`);
      if (serialNumbers.length && serialNumbers.length !== item.stock) errors.push(`Fila ${item.row}: la cantidad de series no coincide con el stock.`);
      const variantKey = [item.brand, item.model, item.capacity, item.color].map(value => value.toLowerCase()).join('|');
      if (seenVariants.has(variantKey)) errors.push(`Fila ${item.row}: la variante ya existe o se repite en el archivo.`);
      seenVariants.add(variantKey);
      const skuKey = item.sku.toUpperCase();
      if (skuKey && seenSkus.has(skuKey)) errors.push(`Fila ${item.row}: el SKU ya existe o se repite.`);
      if (skuKey) seenSkus.add(skuKey);
      for (const imei of imeis) {
        if (!/^\d{15}$/.test(imei) || seenImeis.has(imei)) errors.push(`Fila ${item.row}: IMEI inválido o duplicado (${imei}).`);
        seenImeis.add(imei);
      }
      return item;
    });
    return { rows: parsed, errors };
  }

  function importProductsModal() {
    view.importRows = null;
    const body = `<form id="import-products-form"><div class="form-note" style="margin-bottom:14px">${icon('upload')} Columnas aceptadas: <strong>marca, modelo, capacidad, color, costo, venta, stock, stockMinimo, sku, imei</strong>. Separador coma. No se importa si hay errores. En Google Sheets: Archivo › Descargar › Valores separados por comas (CSV).</div><div class="field"><label class="field-label">Archivo (CSV de Google Sheets)</label><input class="input" id="import-csv-file" type="file" accept=".csv,.xlsx,.xls,text/csv"/><div class="field-hint">Podés seleccionar un archivo o pegar el contenido debajo.</div></div><div class="field" style="margin-top:12px"><label class="field-label">Contenido CSV</label><textarea class="textarea" id="import-csv-input" name="csv" style="min-height:180px" placeholder="marca,modelo,capacidad,color,costo,venta,stock,stockMinimo,sku,imei\nApple,iPhone 17,256GB,Titanio natural,,,0,1,APL-17-256,"></textarea></div><div id="import-preview" class="form-note" style="display:none;margin-top:13px"></div><div id="import-form-error" class="field-error" style="display:none;margin-top:10px"></div></form>`;
    const footer = '<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="import-products-form">' + icon('check') + ' Validar e importar</button>';
    openModal(modalFrame({ title: 'Importar productos', subtitle: 'Validá duplicados y precios antes de confirmar.', body, footer, size: 'medium', kicker: 'IMPORTACIÓN CSV' }));
    const input = document.getElementById('import-csv-input');
    const preview = document.getElementById('import-preview');
    if (input && preview) input.addEventListener('input', () => {
      clearTimeout(input._previewTimer);
      input._previewTimer = setTimeout(() => {
        if (!input.value.trim()) { preview.style.display = 'none'; return; }
        const parsed = normalizeImportRows(input.value);
        preview.style.display = 'block';
        preview.className = parsed.errors.length ? 'form-note danger' : 'form-note';
        preview.innerHTML = `${icon(parsed.errors.length ? 'alert' : 'check')} ${parsed.errors.length ? esc(parsed.errors.slice(0, 3).join(' ')) : `${parsed.rows.length} producto(s) válido(s). La importación se realizará en una sola transacción.`}`;
      }, 180);
    });
    const file = document.getElementById('import-csv-file');
    if (file && input) file.addEventListener('change', () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 5 * 1024 * 1024) { showToast('error', 'CSV demasiado grande', 'El archivo no puede superar 5 MB.'); return; }
      const reader = new FileReader();
      reader.onload = () => { input.value = String(reader.result || ''); input.dispatchEvent(new Event('input', { bubbles: true })); };
      reader.onerror = () => showToast('error', 'No se pudo leer', 'No se pudo leer el archivo CSV seleccionado.');
      reader.readAsText(selected, 'utf-8');
    });
  }

  function backupModal() {
    openModal(modalFrame({ title: 'Backup completo', subtitle: 'Descargar una copia de tu base de datos.', body: `<div class="form-note" style="margin-bottom:15px">${icon('database')} <strong>${store.getState().products.length} productos</strong> · ${store.getState().units.length} unidades · ${store.getState().sales.length} ventas · ${store.getState().purchases.length} compras</div><p style="color:var(--ink-soft);font-size:11px;line-height:1.6">El backup se descarga como un archivo JSON compatible con NEXO. Incluirá datos, movimientos y auditoría. Guardalo en un lugar seguro antes de hacer cambios grandes.</p>`, footer: '<button class="btn btn-secondary" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="backup-export">Descargar backup</button>', size: 'small', kicker: 'DATOS' }));
  }

  /* Event delegation */
  function setPage(page) { if (!page) return; if (!canOpenPage(page)) { showToast('error', 'Sección restringida', 'Tu rol no puede acceder a esta sección.'); return; } view.page = page; view.openMenu = null; closeModal(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeMenus() { if (view.openMenu) { view.openMenu = null; render(); } }
  function showToast(type, title, message = '') { const root = document.getElementById('toast-root'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<span class="toast-icon">${icon(type === 'success' ? 'check' : type === 'error' ? 'x' : 'info')}</span><div class="toast-copy"><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ''}</div>`; root.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(5px)'; setTimeout(() => toast.remove(), 200); }, 4200); }
  function showError(target, message) { const element = document.getElementById(target); if (element) { element.textContent = message; element.style.display = 'block'; } showToast('error', 'Revisá los datos', message); }
  function preserveFocus(renderFn, id, position) { renderFn(); const next = document.getElementById(id); if (next) { next.focus(); if (position !== undefined && next.setSelectionRange) next.setSelectionRange(position, position); } }

  async function handleClick(event) {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) { event.preventDefault(); setPage(pageButton.dataset.page); return; }
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    const id = actionElement.dataset.id;
    if (action === 'toggle-sidebar') { view.openMenu = view.openMenu === 'sidebar' ? null : 'sidebar'; render(); return; }
    if (action === 'toggle-profile') { view.openMenu = view.openMenu === 'profile' ? null : 'profile'; render(); return; }
    if (action === 'close-modal') { if (event.target.classList.contains('modal-backdrop') || event.target.closest('.modal') === null || event.target.closest('.modal-close') || event.target.closest('.modal-footer')) closeModal(); return; }
    if (action === 'open-search') { searchModal(document.getElementById('global-search')?.value || ''); return; }
    if (action === 'toggle-password') { const input = document.getElementById('login-password'); if (input) { input.type = input.type === 'password' ? 'text' : 'password'; actionElement.innerHTML = icon(input.type === 'password' ? 'eye' : 'lock'); } return; }
    if (action === 'forgot-password') { showToast('info', 'Recuperación de acceso', 'Contactá al administrador para restablecer tu contraseña.'); return; }
    if (action === 'show-notifications') { showNotifications(); return; }
    if (action === 'show-shortcuts') { shortcutModal(); return; }
    if (action === 'logout') { try { await store.logout(); showToast('info', 'Sesión cerrada', 'Hasta pronto.'); } catch { showToast('info', 'Sesión cerrada localmente', 'No se pudo avisar al servidor, pero se eliminaron los datos de la sesión.'); } view.openMenu = null; view.loginRequired = true; view.page = 'dashboard'; render(); return; }
    if (action === 'open-product' || action === 'edit-product') { if (!requireRole('Administrador')) return; if (action === 'open-product') productForm(); else { const product = store.getProduct(id); if (product) productForm(product); } return; }
    if (action === 'new-variant') { if (!requireRole('Administrador')) return; const parentId = actionElement.dataset.parentId; const group = store.getState().productGroups?.find(item => item.id === parentId); if (!group) { showToast('error', 'Producto no encontrado', 'No se pudo determinar el producto padre.'); return; } closeModal(); productForm({ brand: group.brand, model: group.model, category: group.category, requiresImei: true, location: store.getSettings().locationName }, parentId); return; }
    if (action === 'product-detail') { const product = store.getProduct(id); if (product) productDetail(product); return; }
    if (action === 'archive-product') { if (!requireRole('Administrador')) return; const product = store.getProduct(id); if (product && window.confirm(`¿Archivar ${productName(product)}? El historial se conservará.`)) { try { await store.archiveProduct(id); closeModal(); render(); showToast('success', 'Producto archivado', 'El historial histórico se conservó.'); } catch (error) { showToast('error', 'No se pudo archivar', error.message); } } return; }
    if (action === 'stock-product' || action === 'open-stock') { if (!requireRole('Administrador', 'Inventario')) return; closeModal(); stockForm(action === 'stock-product' ? id : ''); return; }
    if (action === 'subtract-product' || action === 'open-subtract') { if (!requireRole('Administrador', 'Inventario')) return; closeModal(); subtractForm(action === 'subtract-product' ? id : ''); return; }
    if (action === 'sell-product' || action === 'open-sale') { if (!requireRole('Administrador', 'Vendedor')) return; closeModal(); view.saleDraft = { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `sale-${Date.now()}` }; saleModal(); if (id) { const select = document.getElementById('sale-product-select'); if (select) { select.value = id; updateSaleProductFields(); } } return; }
    if (action === 'open-purchase') { if (!requireRole('Administrador', 'Inventario')) return; view.purchaseDraft = { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `purchase-${Date.now()}` }; purchaseModal(id || ''); return; }
    if (action === 'sale-new-customer') { if (!requireRole('Administrador', 'Vendedor')) return; personForm('customer', {}, { returnToSale: true }); return; }
    if (action === 'open-customer') { if (!requireRole('Administrador', 'Vendedor')) return; personForm('customer', id ? store.getCustomer(id) || {} : {}); return; }
    if (action === 'open-supplier') { if (!requireRole('Administrador', 'Inventario')) return; personForm('supplier', id ? store.getSupplier(id) || {} : {}); return; }
    if (action === 'open-user') { if (!requireRole('Administrador')) return; const user = id ? store.getUser(id) : {}; userForm(user); return; }
    if (action === 'view-customer') { const customer = store.getCustomer(id); if (customer) customerDetail(customer); return; }
    if (action === 'view-supplier') { const supplier = store.getSupplier(id); if (supplier) { closeModal(); supplierDetail(supplier); } return; }
    if (action === 'view-sale') { const sale = store.getState().sales.find(item => item.id === id); if (sale) saleDetail(sale); return; }
    if (action === 'annul-sale') { if (!requireRole('Administrador')) return; const reason = window.prompt('Motivo de anulación:'); if (!reason?.trim()) return; try { const sale = await store.annulSale(id, { reason: reason.trim() }); closeModal(); render(); showToast('success', 'Venta anulada', 'Stock y unidades fueron devueltos.'); } catch (error) { showToast('error', 'No se pudo anular', error.message); } return; }
    if (action === 'open-return') { const sale = store.getState().sales.find(item => item.id === id); if (sale) { closeModal(); returnModal(sale); } return; }
    if (action === 'view-purchase') { const purchase = store.getState().purchases.find(item => item.id === id); if (purchase) purchaseDetail(purchase); return; }
    if (action === 'clear-inventory-filters') { Object.assign(view, { inventoryQuery: '', inventoryStock: '', inventoryBrand: '', inventoryCapacity: '', inventoryColor: '', inventoryCondition: '', inventoryMinPrice: '', inventoryMaxPrice: '', inventoryDate: '', inventorySort: 'novedad' }); render(); return; }
    if (action === 'set-stock-filter') { view.inventoryStock = actionElement.dataset.stock || ''; render(); return; }
    if (action === 'set-chart-range') { view.chartRange = Number(actionElement.dataset.days) || 7; render(); return; }
    if (action === 'set-report-range') { view.reportRange = actionElement.dataset.days || '30'; render(); return; }
    if (action === 'set-product-tab') { view.productTab = actionElement.dataset.tab || 'list'; render(); return; }
    if (action === 'open-catalog') { view.productTab = 'catalog'; setPage('products'); return; }
    if (action === 'set-catalog-group') { view.catalogGroup = actionElement.dataset.group || 'Todos'; render(); return; }
    if (action === 'open-import') { if (!requireRole('Administrador')) return; importProductsModal(); return; }
    if (action === 'catalog-add') { if (!requireRole('Administrador')) return; const model = store.getState().products.find(product => product.model === actionElement.dataset.model); if (model) { view.productTab = 'list'; productForm(model); } else { productForm({ brand: 'Apple', model: actionElement.dataset.model, requiresImei: true, condition: 'Nuevo', location: 'Local' }); } return; }
    if (action === 'clear-purchases') { view.purchasesQuery = ''; render(); return; }
    if (action === 'run-reconciliation') { if (!requireRole('Administrador')) return; const output = document.getElementById('reconciliation-result'); if (output) output.innerHTML = '<div class="form-note">Verificando…</div>'; store.getInventoryReconciliation().then(result => { if (!output) return; output.innerHTML = `<div class="form-note ${result.ok ? '' : 'warning'}">${icon(result.ok ? 'check' : 'alert')} ${result.ok ? 'No se detectaron diferencias.' : `${result.summary.differences} variante(s) con diferencia y ${result.summary.orphanUnits} unidad(es) huérfana(s).`}</div>${result.items.filter(item => item.status !== 'OK').map(item => `<div class="setting-line"><div class="setting-line-copy"><strong>${esc(item.productName)} · ${esc(item.variant)}</strong><span>Registrado ${item.recordedStock} · Físico ${item.physicalStock} · Diferencia ${item.difference}</span></div><button class="btn btn-secondary btn-sm" data-action="reconcile-variant" data-id="${item.variantId}">Ajustar</button></div>`).join('')}`; }).catch(error => { if (output) output.innerHTML = `<div class="form-note danger">${esc(error.message)}</div>`; }); return; }
    if (action === 'reconcile-variant') { if (!requireRole('Administrador')) return; const variant = store.getProduct(id); const reason = window.prompt('Motivo del ajuste de inventario:'); if (!reason?.trim()) return; const physicalStock = variant?.requiresImei ? undefined : window.prompt('Stock físico contado:'); if (!variant?.requiresImei && (physicalStock === null || physicalStock === '' || Number(physicalStock) < 0)) return; try { await store.reconcileInventory({ variantId: id, physicalStock, reason: reason.trim() }); render(); showToast('success', 'Inventario conciliado', variant?.requiresImei ? 'Unidades verificadas.' : 'Stock actualizado con movimiento y auditoría.'); } catch (error) { showToast('error', 'No se pudo conciliar', error.message); } return; }
    if (action === 'open-settings-tab') { view.settingsTab = actionElement.dataset.tab || 'general'; render(); return; }
    if (action === 'open-setting-add') { settingAddModal(actionElement.dataset.key); return; }
    if (action === 'remove-setting-item') { if (!requireRole('Administrador')) return; try { await store.removeOption(actionElement.dataset.key, actionElement.dataset.value); render(); showToast('success', 'Opción eliminada'); } catch (error) { showToast('error', 'No se pudo eliminar', error.message); } return; }
    if (action === 'save-settings') { saveSettings(); return; }
    if (action === 'backup-export') { exportBackup(); return; }
    if (action === 'backup-import') { importFile.click(); return; }
    if (action === 'reset-initial') { if (!requireRole('Administrador')) return; if (window.confirm('¿Restablecer los datos iniciales? Se eliminará la actividad registrada y el catálogo volverá a stock cero.')) { try { await store.reset(); view.loginRequired = true; view.page = 'dashboard'; view.saleDraft = null; view.purchaseDraft = null; render(); showToast('success', 'Datos restablecidos', 'El catálogo quedó sin stock ni actividad.'); } catch (error) { showToast('error', 'No se pudo restablecer', error.message); } } return; }
    if (action === 'export') { const exportType = (actionElement.dataset.export || 'inventory').replace('', ''); const exportRoles = { dashboard: ['Administrador', 'Inventario'], inventory: ['Administrador', 'Inventario'], sales: ['Administrador', 'Vendedor'], customers: ['Administrador', 'Vendedor'], reports: ['Administrador'], users: ['Administrador'], suppliers: ['Administrador', 'Inventario'], purchases: ['Administrador', 'Inventario'], movements: ['Administrador', 'Inventario'] }; if (!requireRole(...(exportRoles[exportType] || ['Administrador']))) return; exportCsv(exportType); return; }
    if (action === 'print') { window.print(); return; }
    if (action === 'search-product') { closeModal(); const product = store.getProduct(id); if (product) { setPage('inventory'); setTimeout(() => productDetail(product), 40); } return; }
    if (action === 'search-unit') { const unit = store.getUnit(id); if (unit) { closeModal(); setPage('inventory'); setTimeout(() => productDetail(store.getProduct(unit.productId)), 40); } return; }
    if (action === 'search-customer') { const customer = store.getCustomer(id); if (customer) { closeModal(); customerDetail(customer); } return; }
    if (action === 'sale-add-item') { addSaleItem(); return; }
    if (action === 'sale-remove-item') { const form = document.getElementById('sale-form'); if (form && view.saleDraft) Object.assign(view.saleDraft, { customerId: form.elements.customerId?.value || '', paymentMethod: form.elements.paymentMethod?.value || 'Efectivo', discount: number(form.elements.discount?.value), notes: form.elements.notes?.value || '' }); view.saleDraft.items.splice(Number(actionElement.dataset.index), 1); saleModal(); return; }
    if (action === 'purchase-add-item') { addPurchaseItem(); return; }
    if (action === 'purchase-remove-item') { const form = document.getElementById('purchase-form'); if (form && view.purchaseDraft) Object.assign(view.purchaseDraft, { supplierId: form.elements.supplierId?.value || '', date: form.elements.date?.value || '', paymentMethod: form.elements.paymentMethod?.value || 'Transferencia', paymentStatus: form.elements.paymentStatus?.value || 'Pagada', notes: form.elements.notes?.value || '' }); view.purchaseDraft.items.splice(Number(actionElement.dataset.index), 1); purchaseModal(view.purchaseDraft.supplierId || ''); return; }
    if (action === 'reserve-product') { if (!requireRole('Administrador', 'Inventario')) return; openReservation(id); return; }
    if (action === 'release-reservation') { if (!requireRole('Administrador', 'Inventario')) return; const reservation = store.getState().reservations.find(item => item.id === id); if (reservation && window.confirm(`¿Liberar la reserva de ${reservation.customerName}? La unidad volverá a estar disponible.`)) { try { await store.releaseReservation(id); closeModal(); setPage('inventory'); showToast('success', 'Reserva liberada', 'La unidad vuelve a estar disponible.'); } catch (error) { showToast('error', 'No se pudo liberar', error.message); } } return; }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.form?.id === 'product-form' && ['cost', 'price'].includes(target.name)) updateProductMarginHint();
    if (target.matches('[data-filter]')) { view[target.dataset.filter] = target.value; const position = target.selectionStart; clearTimeout(target._filterTimer); target._filterTimer = setTimeout(() => preserveFocus(render, target.id, position), 220); return; }
    if (target.id === 'stock-product-search' || target.id === 'subtract-product-search') {
      const query = target.value.trim().toLowerCase();
      const compactQuery = query.replace(/\s/g, '');
      const select = document.getElementById(target.id.replace('-search', '-select'));
      if (!select) return;
      const current = select.value;
      const imeiUnit = compactQuery ? store.getState().units.find(unit => String(unit.imei).includes(compactQuery) || String(unit.serialNumber || '').toLowerCase().includes(query)) : null;
      let found = query ? store.search(query) : store.getProducts();
      if (!query && !imeiUnit) found = store.getProducts();
      if (query && !imeiUnit && !found.length && /s$/i.test(query)) found = store.search(query.slice(0, -1));
      const foundIds = new Set(found.map((result) => result.id));
      const matches = (product) => imeiUnit ? product.id === imeiUnit.productId : foundIds.has(product.id);
      const products = store.getProducts().filter((product) => matches(product));
      select.innerHTML = '<option value="">Seleccionar producto</option>' + products.map((product) => `<option value="${product.id}">${esc(productName(product))} · ${esc(variantName(product))} — ${product.stock} en stock</option>`).join('');
      if (products.some((product) => String(product.id) === String(current))) select.value = current;
      if (query && products.length === 1) select.value = String(products[0].id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const hint = document.getElementById(target.id.replace('-search', '-count'));
      if (hint) {
        hint.textContent = !query ? '' : products.length ? `${products.length} producto(s) coinciden` : 'No hay coincidencias con ese texto.';
      }
      return;
    }
    if (target.id === 'sale-product-search') { const query = target.value.trim().toLowerCase(); const compactQuery = query.replace(/\s/g, ''); const select = document.getElementById('sale-product-select'); if (!select) return; const current = select.value; const imeiUnit = compactQuery ? store.getState().units.find(unit => String(unit.imei).includes(compactQuery) || String(unit.serialNumber).toLowerCase().includes(query)) : null; const products = store.getProducts().filter(product => product.stock > 0 && (imeiUnit ? product.id === imeiUnit.productId : store.search(query).some(result => result.id === product.id))); select.innerHTML = `<option value="">Seleccionar</option>${products.map(product => `<option value="${product.id}">${esc(productName(product))} · ${esc(variantName(product))} (${product.stock})</option>`).join('')}`; if (imeiUnit) select.value = imeiUnit.productId; else if (products.some(product => product.id === current)) select.value = current; updateSaleProductFields(); return; }
    if (target.id === 'search-modal-input') return;
  }

  function handleChange(event) {
    const target = event.target;
    if (target.id === 'stock-product-select' || target.id === 'subtract-product-select') { const product = store.getProduct(target.value); if (target.id === 'stock-product-select') { const cost = target.form.elements.unitCost; if (cost) cost.value = product?.cost != null ? product.cost : ''; const imeiField = document.getElementById('imei-stock-fields'); if (imeiField) imeiField.style.display = product?.requiresImei ? 'block' : 'none'; } else updateSubtractProductFields(); return; }
    if (target.id === 'sale-product-select') { updateSaleProductFields(); return; }
    if (target.id === 'purchase-product-select') { const product = store.getProduct(target.value); const cost = document.getElementById('purchase-cost'); if (product && cost) cost.value = product.cost; return; }
    if (target.matches('[data-filter]')) { view[target.dataset.filter] = target.value; render(); }
  }

  function addSaleItem() {
    const form = document.getElementById('sale-form');
    if (!form || !view.saleDraft) return;
    const productId = form.elements.productId.value;
    const product = store.getProduct(productId);
    if (!product) { showError('sale-form-error', 'Seleccioná un producto.'); return; }
    const quantity = Number(form.elements.quantity.value);
    const price = Number(form.elements.price.value || product.price);
    if (!quantity || quantity < 1) { showError('sale-form-error', 'Ingresá una cantidad válida.'); return; }
    if (!price || price <= 0) { showError('sale-form-error', 'El precio de venta es obligatorio.'); return; }
    const alreadyInCart = view.saleDraft.items.filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0);
    if (product.stock - alreadyInCart < quantity) { showError('sale-form-error', `Stock insuficiente. Disponible para esta venta: ${product.stock - alreadyInCart}.`); return; }
    if (product.requiresImei && quantity !== 1) { showError('sale-form-error', 'Los productos con IMEI se venden de a una unidad por operación.'); return; }
    let unitId = null; let imei = '';
    if (product.requiresImei) { unitId = form.elements.unitId?.value || ''; const unit = store.getUnit(unitId); if (!unit || unit.status !== 'Disponible') { showError('sale-form-error', 'Seleccioná una unidad disponible.'); return; } if (view.saleDraft.items.some(item => item.unitId === unitId)) { showError('sale-form-error', 'Esa unidad ya fue agregada a la venta.'); return; } imei = unit.imei; }
    const discount = Math.max(0, Number(form.elements.discount?.value) || 0);
    if (discount >= price * quantity) { showError('sale-form-error', 'El descuento no puede superar el importe.'); return; }
    Object.assign(view.saleDraft, {
      customerId: form.elements.customerId?.value || '',
      paymentMethod: form.elements.paymentMethod?.value || 'Efectivo',
      discount: Math.max(0, Number(form.elements.discount?.value) || 0),
      notes: form.elements.notes?.value || ''
    });
    view.saleDraft.items.push({ productId, productName: productName(product), variant: variantName(product), quantity, price, discount, unitId, imei, cost: product.cost, total: Math.round(quantity * price - discount) });
    saleModal();
  }

  function addPurchaseItem() {
    const form = document.getElementById('purchase-form');
    if (!form || !view.purchaseDraft) return;
    const product = store.getProduct(document.getElementById('purchase-product-select')?.value);
    const quantity = Number(document.getElementById('purchase-quantity')?.value);
    const unitCost = Number(document.getElementById('purchase-cost')?.value);
    if (!product) { showError('purchase-form-error', 'Seleccioná un producto.'); return; }
    if (!quantity || quantity < 1 || !unitCost || unitCost <= 0) { showError('purchase-form-error', 'Completá producto, cantidad y costo unitario.'); return; }
    const imeis = (document.getElementById('purchase-imeis')?.value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    const serials = (document.getElementById('purchase-serials')?.value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (product.requiresImei && imeis.length !== quantity) { showError('purchase-form-error', `Ingresá ${quantity} IMEI${quantity === 1 ? '' : 's'} para ${product.model}.`); return; }
    if (!product.requiresImei && imeis.length) { showError('purchase-form-error', 'Este producto se maneja por cantidad y no admite IMEI.'); return; }
    if (serials.length && serials.length !== quantity) { showError('purchase-form-error', 'La cantidad de números de serie debe coincidir con las unidades.'); return; }
    const draftImeis = new Set(view.purchaseDraft.items.flatMap(item => item.imeis || []));
    if (imeis.some(imei => !/^\d{15}$/.test(imei) || store.isDuplicateImei(imei) || draftImeis.has(imei) || imeis.filter(value => value === imei).length > 1)) { showError('purchase-form-error', 'Revisá los IMEI: cada uno debe tener 15 dígitos y ser único, incluso dentro de la compra.'); return; }
    Object.assign(view.purchaseDraft, { supplierId: form.elements.supplierId.value, date: form.elements.date.value, paymentMethod: form.elements.paymentMethod.value, paymentStatus: form.elements.paymentStatus.value, notes: form.elements.notes?.value || '' });
    view.purchaseDraft.items.push({ productId: product.id, productName: productName(product), variant: variantName(product), quantity, unitCost, imeis, serialNumbers: serials, total: Math.round(quantity * unitCost) });
    purchaseModal(view.purchaseDraft.supplierId || '');
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    const data = Object.fromEntries(new FormData(form).entries());
    const submitButton = modalRoot.querySelector(`button[form="${form.id}"]`) || form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      if (form.id === 'login-form') { const user = await store.login(data.email, data.password); view.loginRequired = false; view.page = 'dashboard'; render(); showToast('success', `Bienvenido, ${user.name.split(' ')[0]}`, 'Tu sesión se inició correctamente.'); return; }
      if (form.id === 'product-form') { const payload = { ...data, requiresImei: form.elements.requiresImei.checked, costRegistered: form.elements.costRegistered?.checked || false, salePriceRegistered: form.elements.salePriceRegistered?.checked || false }; const id = form.dataset.id; const parentId = form.dataset.parentId; const result = parentId ? await store.createVariant(parentId, payload) : id ? await store.updateProduct(id, payload) : await store.addProduct(payload); closeModal(); render(); showToast('success', parentId ? 'Variante creada' : id ? 'Producto actualizado' : 'Producto creado', `${productName(result)} · ${variantName(result)}`); return; }
      if (form.id === 'stock-form') { const imeis = String(data.imeis || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean); const serials = String(data.serialNumbers || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean); const result = await store.addStock({ ...data, imeis, serialNumbers: serials, date: data.date ? `${data.date}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString() }); closeModal(); render(); showToast('success', 'Stock agregado', `${result.stock} unidades disponibles de ${productName(result)}.`); return; }
      if (form.id === 'subtract-form') { const selectedUnits = [...document.getElementById('subtract-unit-select')?.selectedOptions || []].map(option => option.value); const selectedProduct = store.getProduct(data.productId); if (selectedProduct?.requiresImei && selectedUnits.length !== Number(data.quantity)) { showError('subtract-form-error', 'Seleccioná exactamente la cantidad de IMEI indicada.'); return; } if (!window.confirm(`¿Confirmar la salida de ${Number(data.quantity)} unidad(es)? Esta operación quedará registrada en el historial.`)) return; const result = await store.removeStock({ ...data, unitIds: selectedUnits }); closeModal(); render(); showToast('success', 'Stock actualizado', `${result.stock} unidades disponibles.`); return; }
      if (form.id === 'sale-form') { if (!view.saleDraft?.items.length) { showError('sale-form-error', 'Agregá al menos un producto.'); return; } const draftTotal = Math.max(0, view.saleDraft.items.reduce((sum, item) => sum + item.total, 0) - number(data.discount)); if (!window.confirm(`¿Confirmar la venta por ${money(draftTotal)}? Se descontará el stock y quedará registrada de forma permanente.`)) return; const sale = await store.createSale({ ...data, items: view.saleDraft.items, idempotencyKey: view.saleDraft.idempotencyKey, date: new Date().toISOString() }); closeModal(); view.saleDraft = null; setPage('sales'); showToast('success', 'Venta confirmada', `#${sale.id.replace('sal_', '').slice(-5).toUpperCase()} · ${money(sale.total)}${hasRole('Administrador', 'Inventario') ? ` · ganancia ${money(sale.profit)}` : ''}`); return; }
      if (form.id === 'purchase-form') { if (!view.purchaseDraft?.items.length) { showError('purchase-form-error', 'Agregá al menos un producto.'); return; } const draftTotal = view.purchaseDraft.items.reduce((sum, item) => sum + item.total, 0); if (!window.confirm(`¿Confirmar la compra por ${money(draftTotal)}? Se ingresará el stock de forma transaccional.`)) return; const purchase = await store.createPurchase({ ...data, items: view.purchaseDraft.items, idempotencyKey: view.purchaseDraft.idempotencyKey, date: data.date ? `${data.date}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString() }); closeModal(); view.purchaseDraft = null; setPage('purchases'); showToast('success', 'Compra confirmada', `${money(purchase.total)} · stock actualizado.`); return; }
      if (form.id === 'return-form') { const selected = [...form.querySelectorAll('input[name="saleItemId"]:checked')].map(input => input.value); if (!selected.length) { showError('return-form-error', 'Seleccioná al menos una línea.'); return; } const restocked = form.elements.restocked?.checked !== false; const result = await store.createReturn(form.dataset.saleId, { reason: data.reason, items: selected.map(saleItemId => ({ saleItemId, quantity: 1, restocked })) }); closeModal(); render(); showToast('success', 'Devolución registrada', `Stock actualizado · ${result.items?.length || selected.length} línea(s).`); return; }
      if (form.id === 'reservation-form') { const reservation = await store.createReservation({ ...data, unitId: form.dataset.unitId }); closeModal(); render(); showToast('success', 'Unidad reservada', `${reservation.customerName} · vence ${dateLabel(reservation.expiresAt)}`); return; }
      if (form.id === 'import-products-form') {
        const parsed = normalizeImportRows(data.csv || document.getElementById('import-csv-input')?.value || '');
        if (parsed.errors.length) { showError('import-form-error', parsed.errors.slice(0, 4).join(' ')); return; }
        if (!window.confirm(`Importar ${parsed.rows.length} producto(s) en una sola transacción?`)) return;
        const importRows = parsed.rows.map(({ row, ...rowData }) => ({ ...rowData, imeis: rowData.imei ? rowData.imei.split(/[;,|]/).map(value => value.trim()).filter(Boolean) : [] }));
        const result = await store.importProducts(importRows);
        closeModal(); render(); showToast('success', 'Importación completa', `${result.imported} producto(s) incorporados.`); return;
      }
      if (form.id === 'person-form') { let result; if (form.dataset.id) { result = form.dataset.type === 'customer' ? await store.updateCustomer(form.dataset.id, data) : await store.updateSupplier(form.dataset.id, data); } else { result = form.dataset.type === 'customer' ? await store.createCustomer(data) : await store.createSupplier(data); } closeModal(); if (form.dataset.context === 'sale' && result?.id) { view.saleDraft = view.saleDraft || { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `sale-${Date.now()}` }; view.saleDraft.customerId = result.id; saleModal(); } else render(); showToast('success', form.dataset.id ? (form.dataset.type === 'customer' ? 'Cliente actualizado' : 'Proveedor actualizado') : (form.dataset.type === 'customer' ? 'Cliente creado' : 'Proveedor creado'), data.name); return; }
      if (form.id === 'user-form') { const userPayload = { ...data, active: form.elements.active ? form.elements.active.checked : true }; if (!userPayload.password) delete userPayload.password; if (form.dataset.id) await store.updateUser(form.dataset.id, userPayload); else await store.createUser(userPayload); closeModal(); render(); showToast('success', form.dataset.id ? 'Usuario actualizado' : 'Usuario creado', `${data.name} · ${data.role}`); return; }
      if (form.id === 'setting-add-form') { const key = form.dataset.key; const value = String(data.value || '').trim(); if (!value) throw new Error('Ingresá un valor.'); if (store.getState()[key]?.includes(value)) throw new Error('La opción ya existe.'); await store.addOption(key, value); closeModal(); render(); showToast('success', 'Opción agregada', value); return; }
    } catch (error) {
      const normalized = form.id === 'login-form' ? 'login-error' : form.id === 'product-form' ? 'product-form-error' : form.id === 'stock-form' ? 'stock-form-error' : form.id === 'subtract-form' ? 'subtract-form-error' : form.id === 'sale-form' ? 'sale-form-error' : form.id === 'return-form' ? 'return-form-error' : form.id === 'purchase-form' ? 'purchase-form-error' : form.id === 'reservation-form' ? 'reservation-form-error' : form.id === 'import-products-form' ? 'import-form-error' : form.id === 'person-form' ? 'person-form-error' : form.id === 'user-form' ? 'user-form-error' : form.id === 'setting-add-form' ? 'setting-add-error' : '';
      if (normalized) showError(normalized, error.message);
      else showToast('error', form.id === 'login-form' ? 'No se pudo iniciar sesión' : 'No se pudo guardar', error.message);
    } finally {
      delete form.dataset.busy;
      if (submitButton?.isConnected) submitButton.disabled = false;
    }
  }

  async function saveSettings() {
    const current = store.getSettings();
    try {
      await store.updateSettings({
        businessName: document.getElementById('setting-business')?.value.trim() || current.businessName,
        legalName: document.getElementById('setting-legal')?.value.trim() || '',
        locationName: document.getElementById('setting-location')?.value.trim() || 'Córdoba Capital',
        currency: 'USD',
        minMargin: Math.max(0, Number(document.getElementById('setting-margin')?.value) || 0),
        defaultMinStock: Math.max(0, Number(document.getElementById('setting-min-stock')?.value) || 0),
        taxRate: Math.max(0, Number(document.getElementById('setting-tax')?.value) || 0),
    investedCapital: Math.max(0, Number(document.getElementById('setting-capital')?.value) || 0),
        lowStockNotifications: Boolean(document.getElementById('setting-alerts')?.checked),
        allowNegativeStock: Boolean(document.getElementById('setting-negative')?.checked)
      });
      render();
      showToast('success', 'Configuración guardada', 'Los cambios se aplicaron al sistema.');
    } catch (error) {
      showToast('error', 'No se pudo guardar', error.message);
    }
  }

  async function exportBackup() {
    try {
      const backup = await store.exportData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexo-backup-${todayInput()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Backup descargado', 'La fecha del último backup quedó actualizada en el servidor.');
    } catch (error) {
      showToast('error', 'No se pudo exportar', error.message);
    }
  }


  function downloadText(filename, content, type = 'text/csv;charset=utf-8') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

  function csvCell(value) { const text = String(value ?? ''); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; }
  function exportCsv(type) {
    let rows = []; let filename = 'nexo-export.csv';
    if (type === 'inventory' || type === 'dashboard') { rows = [['ID', 'Marca', 'Modelo', 'Variante', 'Capacidad', 'Color', 'Condicion', 'Stock', 'Stock minimo', 'Costo', 'Precio', 'Ganancia', 'Margen %', 'SKU', 'Ubicacion']]; store.getProducts().forEach(product => rows.push([product.id, product.brand, product.model, variantName(product), product.capacity, product.color, product.condition, product.stock, product.minStock, product.cost, product.price, profit(product), margin(product) === null ? '—' : margin(product).toFixed(2), product.sku, product.location])); filename = 'nexo-inventario.csv'; }
    if (type === 'sales') { const financials = hasRole('Administrador', 'Inventario'); rows = [financials ? ['ID', 'Fecha', 'Cliente', 'Medio de pago', 'Total', 'Costo', 'Ganancia', 'Productos'] : ['ID', 'Fecha', 'Cliente', 'Medio de pago', 'Total', 'Productos']]; store.getState().sales.forEach(sale => rows.push(financials ? [sale.id, sale.date, sale.customerName, sale.paymentMethod, sale.total, sale.cost, sale.profit, sale.items.map(item => `${item.quantity}x ${item.productName}${item.imei ? ` (${item.imei})` : ''}`).join(' | ')] : [sale.id, sale.date, sale.customerName, sale.paymentMethod, sale.total, sale.items.map(item => `${item.quantity}x ${item.productName}${item.imei ? ` (${item.imei})` : ''}`).join(' | ')])); filename = 'nexo-ventas.csv'; }
    if (type === 'purchases') { rows = [['ID', 'Fecha', 'Proveedor', 'Total', 'Pago', 'Estado', 'Productos']]; store.getState().purchases.forEach(purchase => rows.push([purchase.id, purchase.date, purchase.supplierName, purchase.total, purchase.paymentMethod, purchase.paymentStatus, purchase.items.map(item => `${item.quantity}x ${item.productName}`).join(' | ')])); filename = 'nexo-compras.csv'; }
    if (type === 'movements') { rows = [['ID', 'Fecha', 'Usuario', 'Tipo', 'Producto', 'IMEI', 'Cantidad', 'Stock anterior', 'Stock posterior', 'Costo', 'Precio', 'Motivo']]; store.getState().movements.forEach(movement => { const product = store.getProduct(movement.productId); rows.push([movement.id, movement.date, userName(movement.userId), movement.type, product ? productName(product) : '', movement.imei, movement.quantity, movement.stockBefore, movement.stockAfter, movement.cost || '', movement.price || '', movement.reason || '']); }); filename = 'nexo-movimientos.csv'; }
    if (type === 'customers') { rows = [['ID', 'Nombre', 'DNI', 'Telefono', 'WhatsApp', 'Email', 'Direccion', 'Total gastado']]; store.getState().customers.forEach(customer => rows.push([customer.id, customer.name, customer.taxId, customer.phone, customer.whatsapp, customer.email, customer.address, store.getState().sales.filter(sale => sale.customerId === customer.id).reduce((sum, sale) => sum + sale.total, 0)])); filename = 'nexo-clientes.csv'; }
    if (type === 'suppliers') { rows = [['ID', 'Nombre', 'Empresa', 'CUIT', 'Telefono', 'WhatsApp', 'Email', 'Direccion', 'Total comprado']]; store.getState().suppliers.forEach(supplier => rows.push([supplier.id, supplier.name, supplier.company, supplier.taxId, supplier.phone, supplier.whatsapp, supplier.email, supplier.address, store.getState().purchases.filter(purchase => purchase.supplierId === supplier.id).reduce((sum, purchase) => sum + purchase.total, 0)])); filename = 'nexo-proveedores.csv'; }
    if (type === 'users') { rows = [['ID', 'Nombre', 'Email', 'Rol', 'Activo', 'Último acceso']]; store.getState().users.forEach(user => rows.push([user.id, user.name, user.email, user.role, user.active ? 'Sí' : 'No', user.lastLogin || ''])); filename = 'nexo-usuarios.csv'; }
    if (type === 'reports') { const days = Number(view.reportRange) || 30; const from = new Date(Date.now() - days * 86400000); const rangeSales = store.getState().sales.filter(sale => new Date(sale.date) >= from); const rangePurchases = store.getState().purchases.filter(purchase => new Date(purchase.date) >= from); rows = [['Reporte', 'Periodo', 'Valor'], ['Ventas', `${days} días`, rangeSales.reduce((sum, sale) => sum + sale.total, 0)], ['Ganancia', `${days} días`, rangeSales.reduce((sum, sale) => sum + sale.profit, 0)], ['Compras', `${days} días`, rangePurchases.reduce((sum, purchase) => sum + purchase.total, 0)], ['Capital en inventario', 'Actual', store.getMetrics().stockValue]]; filename = `nexo-reporte-${days}d.csv`; }
    if (!rows.length) rows = [['Dato'], ['Sin datos']];
    downloadText(filename, '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\n'));
    showToast('success', 'Exportación lista', `${filename} se descargó correctamente.`);
  }

  function importBackupFile(file) { if (!file) return; if (file.size > 25 * 1024 * 1024) { showToast('error', 'Archivo demasiado grande', 'El backup supera el límite permitido de 25 MB.'); return; } const reader = new FileReader(); reader.onload = async () => { try { const backup = JSON.parse(reader.result); const data = backup.data || backup; if (!data?.version || !Array.isArray(data.products)) throw new Error('El archivo no tiene un formato de backup compatible.'); const summary = `productos: ${data.products.length}, ventas: ${data.sales?.length || 0}, compras: ${data.purchases?.length || 0}`; if (!window.confirm(`¿Restaurar este backup?\n${summary}\nLa base actual será reemplazada de forma transaccómica.`)) return; await store.importData(backup); closeModal(); render(); showToast('success', 'Backup restaurado', 'Los datos se actualizaron correctamente.'); } catch (error) { showToast('error', 'No se pudo restaurar', error.message); } }; reader.readAsText(file); }

  /* Keyboard shortcuts and outside clicks */
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && modalRoot.querySelector('[data-modal-content]')) {
      const focusable = [...modalRoot.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    if (event.key === 'Escape') { if (modalRoot.innerHTML) closeModal(); else if (view.openMenu) { view.openMenu = null; render(); } }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (store.isAuthenticated()) searchModal(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && canOpenPage('sales')) { event.preventDefault(); setPage('sales'); view.saleDraft = { items: [], idempotencyKey: window.crypto?.randomUUID?.() || `sale-${Date.now()}` }; saleModal(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') { event.preventDefault(); setPage('inventory'); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { const form = document.querySelector('.modal form'); if (form) { event.preventDefault(); form.requestSubmit(); } }
  });
  document.addEventListener('click', event => { if (view.openMenu && !event.target.closest('.user-menu') && !event.target.closest('.profile-popover') && !event.target.closest('.sidebar')) { view.openMenu = null; render(); } });
  document.addEventListener('nexo:unauthorized', () => { closeModal(); view.loginRequired = true; view.page = 'dashboard'; render(); showToast('info', 'Sesión vencida', 'Ingresá nuevamente para continuar.'); });
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit);
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleChange);
  modalRoot.addEventListener('click', handleClick);
  modalRoot.addEventListener('input', handleInput);
  modalRoot.addEventListener('change', handleChange);
  modalRoot.addEventListener('submit', handleSubmit);
  importFile.addEventListener('change', event => { importBackupFile(event.target.files[0]); event.target.value = ''; });

  async function boot() {
    render();
    try {
      const user = await store.init();
      view.booting = false;
      view.loginRequired = !user;
      if (!canOpenPage(view.page)) view.page = 'dashboard';
      render();
    } catch (error) {
      console.error('No se pudo conectar con el servidor:', error);
      view.booting = false;
      app.innerHTML = `<div class="boot-screen"><div class="boot-mark">!</div><div class="boot-copy" style="max-width:420px;text-align:center">No se pudo conectar con el servidor. Iniciá NEXO con <strong>npm start</strong> y verificá la base de datos.</div><button class="btn btn-primary" type="button" data-action="retry-connection">Reintentar conexión</button></div>`;
      app.querySelector('[data-action="retry-connection"]')?.addEventListener('click', () => { view.booting = true; boot(); });
    }
  }
  boot();
})();
