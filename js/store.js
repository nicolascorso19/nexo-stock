/* Capa de dominio conectada al backend. La base de datos real nunca se guarda en el navegador. */
(function () {
  'use strict';

  const C = window.StockCatalog;
  const number = value => Number(value) || 0;
  const round = value => Math.round(number(value) * 100) / 100;
  const localDate = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const dateOnly = value => String(value || '').slice(0, 10);

  function emptyState() {
    return {
      version: 1,
      settings: {
        businessName: 'NEXO Móviles',
        currency: 'USD',
        locationName: 'Córdoba Capital',
        valuationMethod: 'AVERAGE',
        minMargin: 0,
        defaultMinStock: 1,
        lastUnitThreshold: 1,
        allowNegativeStock: false,
        lastBackup: null
      },
      users: [],
      suppliers: [],
      customers: [],
      products: [],
      units: [],
      sales: [],
      returns: [],
      purchases: [],
      movements: [],
      reservations: [],
      warrantyClaims: [],
      auditLogs: [],
      paymentMethods: [...C.paymentMethods],
      categories: [...C.categories],
      locations: [...C.locations],
      capacities: [...C.capacities],
      colors: [...C.colors],
      brands: ['Apple', ...C.otherBrands]
    };
  }

  class Store {
    constructor() {
      this.state = emptyState();
      this.user = null;
      this.ready = false;
    }

    async request(url, options = {}) {
      const request = { credentials: 'same-origin', cache: 'no-store', ...options };
      request.headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) };
      if (options.body && typeof options.body !== 'string') {
        request.headers['Content-Type'] = 'application/json';
        request.body = JSON.stringify(options.body);
      }
      const controller = new AbortController();
      request.signal = options.signal || controller.signal;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await fetch(url, request);
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('La operación tardó demasiado. Revisá la conexión e intentá nuevamente.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : await response.text();
      if (!response.ok) {
        if (response.status === 401 && this.user) {
          this.user = null;
          window.dispatchEvent(new CustomEvent('nexo:unauthorized'));
        }
        const apiError = payload && typeof payload === 'object' ? payload.error : null;
        const error = new Error(apiError?.message || (typeof payload === 'string' && payload) || `Error ${response.status}`);
        error.status = response.status;
        error.details = apiError?.details || null;
        throw error;
      }
      return payload;
    }

    apply(payload) {
      if (payload?.state) this.state = payload.state;
      const user = payload?.user || payload?.data?.user;
      if (user) this.user = user;
      this.ready = true;
      return payload?.data;
    }

    async init() {
      try {
        const session = await this.request('/api/auth/me');
        const sessionUser = session?.user || session?.data?.user;
        if (!sessionUser) return null;
        this.user = sessionUser;
        const payload = await this.request('/api/bootstrap');
        this.state = payload;
        this.ready = true;
        return this.user;
      } catch (error) {
        if (error.status === 401) {
          this.user = null;
          this.ready = true;
          return null;
        }
        throw error;
      }
    }

    async login(email, password) {
      const payload = await this.request('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      this.apply(payload);
      return this.user;
    }

    async logout() {
      try { await this.request('/api/auth/logout', { method: 'POST' }); } finally {
        this.user = null;
        this.state = emptyState();
      }
    }

    async refresh() {
      const payload = await this.request('/api/bootstrap');
      this.state = payload;
      return this.state;
    }

    getState() { return this.state; }
    getSettings() { return this.state.settings; }
    getProducts(includeArchived = false) { return this.state.products.filter(product => includeArchived || product.status !== 'Archivado'); }
    getProduct(id) { return this.state.products.find(product => product.id === id); }
    getUnit(id) { return this.state.units.find(unit => unit.id === id); }
    getUser(id) { return this.state.users.find(user => user.id === id); }
    getSupplier(id) { return this.state.suppliers.find(supplier => supplier.id === id); }
    getCustomer(id) { return this.state.customers.find(customer => customer.id === id); }
    getSessionUser() { return this.state.users.find(user => user.id === this.user?.id) || this.user || null; }
    isAuthenticated() { return Boolean(this.user); }

    isDuplicateImei(imei, ignoreUnitId = null) {
      const normalized = String(imei || '').replace(/\s/g, '').toUpperCase();
      return this.state.units.find(unit => unit.id !== ignoreUnitId && String(unit.imei).toUpperCase() === normalized) || null;
    }

    async addProduct(payload) {
      return this.apply(await this.request('/api/products', { method: 'POST', body: payload }));
    }

    async importProducts(rows) {
      return this.apply(await this.request('/api/products/import', { method: 'POST', body: { rows } }));
    }

    async updateProduct(id, payload) {
      return this.apply(await this.request(`/api/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }));
    }

    async createVariant(parentId, payload) {
      return this.apply(await this.request(`/api/products/${encodeURIComponent(parentId)}/variants`, { method: 'POST', body: payload }));
    }

    async updateApplePrice(id, payload) {
      return this.apply(await this.request(`/api/products/${encodeURIComponent(id)}/apple-price`, { method: 'PATCH', body: payload }));
    }

    async archiveProduct(id) {
      return this.apply(await this.request(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    }

    async addStock(payload) {
      return this.apply(await this.request('/api/stock', { method: 'POST', body: payload }));
    }

    async removeStock(payload) {
      return this.apply(await this.request('/api/stock/remove', { method: 'POST', body: payload }));
    }

    async createSale(payload) {
      const idempotencyKey = payload.idempotencyKey || window.crypto?.randomUUID?.() || `sale-${Date.now()}`;
      return this.apply(await this.request('/api/sales', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { ...payload, idempotencyKey } }));
    }

    async createPurchase(payload) {
      const idempotencyKey = payload.idempotencyKey || window.crypto?.randomUUID?.() || `purchase-${Date.now()}`;
      return this.apply(await this.request('/api/purchases', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { ...payload, idempotencyKey } }));
    }

    async annulSale(id, payload) {
      return this.apply(await this.request(`/api/sales/${encodeURIComponent(id)}/annul`, { method: 'POST', body: payload }));
    }

    async createReturn(id, payload) {
      return this.apply(await this.request(`/api/sales/${encodeURIComponent(id)}/returns`, { method: 'POST', body: payload }));
    }

    async getCustomerHistory(id) {
      return (await this.request(`/api/customers/${encodeURIComponent(id)}/history`)).data;
    }

    async getInventoryReconciliation() {
      return (await this.request('/api/admin/inventory-check')).data;
    }

    async reconcileInventory(payload) {
      return this.apply(await this.request('/api/admin/inventory-check', { method: 'POST', body: payload }));
    }

    async createCustomer(payload) {
      return this.apply(await this.request('/api/customers', { method: 'POST', body: payload }));
    }

    async createSupplier(payload) {
      return this.apply(await this.request('/api/suppliers', { method: 'POST', body: payload }));
    }

    async updateCustomer(id, payload) {
      return this.apply(await this.request(`/api/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }));
    }

    async updateSupplier(id, payload) {
      return this.apply(await this.request(`/api/suppliers/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }));
    }

    async createUser(payload) {
      return this.apply(await this.request('/api/users', { method: 'POST', body: payload }));
    }

    async updateUser(id, payload) {
      return this.apply(await this.request(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }));
    }

    async updateSettings(payload) {
      return this.apply(await this.request('/api/settings', { method: 'PATCH', body: payload }));
    }

    async addOption(key, value) {
      const typeMap = { brands: 'brand', colors: 'color', capacities: 'capacity', locations: 'location', categories: 'category', paymentMethods: 'payment_method', models: 'product_model' };
      return this.apply(await this.request('/api/options', { method: 'POST', body: { type: typeMap[key] || key, value } }));
    }

    async removeOption(key, value) {
      const typeMap = { brands: 'brand', colors: 'color', capacities: 'capacity', locations: 'location', categories: 'category', paymentMethods: 'payment_method', models: 'product_model' };
      return this.apply(await this.request('/api/options', { method: 'DELETE', body: { type: typeMap[key] || key, value } }));
    }

    async createReservation(payload) {
      return this.apply(await this.request('/api/reservations', { method: 'POST', body: payload }));
    }

    async releaseReservation(id) {
      return this.apply(await this.request(`/api/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    }

    async exportData() {
      const payload = await this.request('/api/admin/backup');
      await this.refresh();
      return payload.backup || payload;
    }

    async importData(json) {
      const backup = typeof json === 'string' ? JSON.parse(json) : json;
      return this.apply(await this.request('/api/admin/backup/restore', { method: 'POST', body: { backup } }));
    }

    async reset() {
      this.apply(await this.request('/api/admin/reset-empty', { method: 'POST' }));
      this.user = null;
    }

    getMetrics() {
      const state = this.state;
      const day = localDate();
      const month = day.slice(0, 7);
      const activeSales = state.sales.filter(item => item.statusCode !== 'ANNULLED' && item.status !== 'ANULADA');
      const salesDay = activeSales.filter(item => dateOnly(item.date) === day);
      const salesMonth = activeSales.filter(item => dateOnly(item.date).startsWith(month));
      const purchasesMonth = state.purchases.filter(item => dateOnly(item.date).startsWith(month));
      const now = new Date();
      const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const previousSales = activeSales.filter(item => dateOnly(item.date).startsWith(previousMonth)).reduce((sum, sale) => sum + sale.total, 0);
      const currentSales = salesMonth.reduce((sum, sale) => sum + sale.total, 0);
      const serializedValue = new Map();
      for (const unit of state.units) {
        if (!['Disponible', 'Reservado'].includes(unit.status)) continue;
        serializedValue.set(unit.productId, (serializedValue.get(unit.productId) || 0) + number(unit.cost));
      }
      const stockValue = state.products.reduce((sum, product) => sum + (product.requiresImei ? (serializedValue.get(product.id) || 0) : product.stock * number(product.cost)), 0);
      const retailValue = state.products.reduce((sum, product) => sum + product.stock * number(product.promoPrice || product.price), 0);
      const units = state.products.reduce((sum, product) => sum + product.stock, 0);
      const lowStock = state.products.filter(product => product.stock > 0 && product.stock <= product.minStock).length;
      const outOfStock = state.products.filter(product => product.stock === 0).length;
      return {
        stockValue,
        retailValue,
        units,
        productCount: state.products.filter(product => product.status !== 'Archivado').length,
        lowStock,
        outOfStock,
        potentialProfit: state.products.some(product => product.cost === null || product.price === null) ? null : retailValue - stockValue,
        salesDay: salesDay.reduce((sum, sale) => sum + sale.total, 0),
        salesMonth: currentSales,
        previousSalesMonth: previousSales,
        salesTrendPercent: previousSales > 0 ? ((currentSales - previousSales) / previousSales) * 100 : null,
        profitDay: salesDay.some(sale => sale.profit === null) ? null : salesDay.reduce((sum, sale) => sum + sale.profit, 0),
        profitMonth: salesMonth.some(sale => sale.profit === null) ? null : salesMonth.reduce((sum, sale) => sum + sale.profit, 0),
        purchasesMonth: purchasesMonth.reduce((sum, purchase) => sum + purchase.total, 0),
        unitsSoldMonth: salesMonth.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)
      };
    }

    getTopProducts(limit = 5, days = 30) {
      const from = new Date();
      from.setDate(from.getDate() - days);
      const map = new Map();
      this.state.sales
        .filter(sale => sale.statusCode !== 'ANNULLED' && sale.status !== 'ANULADA')
        .filter(sale => new Date(sale.date) >= from)
        .forEach(sale => sale.items.forEach(item => {
          const current = map.get(item.productId) || { quantity: 0, total: 0, profit: 0 };
          current.quantity += item.quantity;
          current.total += item.total;
          current.profit += item.total - item.cost * item.quantity;
          map.set(item.productId, current);
        }));
      return [...map.entries()]
        .map(([productId, values]) => ({ productId, product: this.getProduct(productId), ...values }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit);
    }

    getDailySeries(days = 7) {
      const output = [];
      for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - index);
        const key = localDate(date);
        const sales = this.state.sales.filter(sale => sale.statusCode !== 'ANNULLED' && sale.status !== 'ANULADA' && dateOnly(sale.date) === key);
        const purchases = this.state.purchases.filter(purchase => dateOnly(purchase.date) === key);
        output.push({
          key,
          label: date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
          sales: sales.reduce((sum, sale) => sum + sale.total, 0),
          profit: sales.reduce((sum, sale) => sum + sale.profit, 0),
          purchases: purchases.reduce((sum, purchase) => sum + purchase.total, 0)
        });
      }
      return output;
    }

    search(query, filters = {}) {
      const normalized = String(query || '').trim().toLowerCase();
      return this.getProducts().filter(product => {
        const text = [
          product.brand,
          product.model,
          product.variant,
          product.capacity,
          product.color,
          product.condition,
          product.sku,
          product.barcode,
          this.getSupplier(product.supplierId)?.name
        ].join(' ').toLowerCase();
        const compactQuery = normalized.replace(/\s/g, '');
        const unitMatch = normalized
          ? this.state.units.some(unit => unit.productId === product.id && (String(unit.imei).includes(compactQuery) || String(unit.serialNumber).toLowerCase().includes(normalized)))
          : true;
        const matchesText = !normalized || text.includes(normalized) || unitMatch;
        const matchesStock = !filters.stock || (
          filters.stock === 'low' ? product.stock > 0 && product.stock <= product.minStock
          : filters.stock === 'out' ? product.stock === 0
          : filters.stock === 'available' ? product.stock > 0
          : true
        );
        const matchesBrand = !filters.brand || product.brand === filters.brand;
        const matchesCondition = !filters.condition || product.condition === filters.condition;
        return matchesText && matchesStock && matchesBrand && matchesCondition;
      });
    }
  }

  window.StockStore = new Store();
})();
