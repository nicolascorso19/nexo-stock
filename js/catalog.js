/* Catálogo editable. Los precios no se incluyen aquí: se cargan desde la base de datos. */
window.StockCatalog = (function () {
  const capacities = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
  const colors = [
    'Negro', 'Blanco', 'Azul', 'Verde', 'Rojo', 'Rosa', 'Violeta', 'Amarillo',
    'Gris', 'Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'
  ];
  const conditions = ['Nuevo', 'Usado', 'Reacondicionado', 'Exhibición', 'Reparado'];
  const physicalStates = ['10/10', '9/10', '8/10', '7/10', 'Otro'];
  const productConditions = ['Nuevo', 'Usado', 'Reacondicionado', 'Exhibición', 'Reparado'];
  const locations = ['Local', 'Depósito', 'Vitrina 1', 'Vitrina 2', 'Depósito 2'];
  const categories = ['Celulares', 'Accesorios', 'Tablets', 'Notebooks', 'Wearables', 'Otros'];

  const iphoneModels = [
    { name: 'iPhone 18', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 18 Plus', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 18 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 18 Pro Max', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 17', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 17 Air', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 17 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 17 Pro Max', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 16', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Verde'] },
    { name: 'iPhone 16 Plus', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Verde'] },
    { name: 'iPhone 16 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 16 Pro Max', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 16e', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco'] },
    { name: 'iPhone 15', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 15 Plus', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
    { name: 'iPhone 15 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 15 Pro Max', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 14', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul'] },
    { name: 'iPhone 14 Plus', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul'] },
    { name: 'iPhone 14 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 14 Pro Max', capacities: ['256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
    { name: 'iPhone 13', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul', 'Verde'] },
    { name: 'iPhone 13 mini', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul', 'Verde'] },
    { name: 'iPhone 13 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Grafito', 'Oro', 'Plata', 'Verde'] },
    { name: 'iPhone 13 Pro Max', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Grafito', 'Oro', 'Plata', 'Verde'] },
    { name: 'iPhone 12', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde'] },
    { name: 'iPhone 12 mini', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde'] },
    { name: 'iPhone 12 Pro', capacities: ['128GB', '256GB', '512GB'], colors: ['Grafito', 'Oro', 'Plata'] },
    { name: 'iPhone 12 Pro Max', capacities: ['128GB', '256GB', '512GB'], colors: ['Grafito', 'Oro', 'Plata'] },
    { name: 'iPhone 11', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Amarillo', 'Verde'] },
    { name: 'iPhone 11 Pro', capacities: ['64GB', '128GB', '256GB', '512GB'], colors: ['Verde', 'Gris', 'Oro', 'Plata'] },
    { name: 'iPhone 11 Pro Max', capacities: ['64GB', '128GB', '256GB', '512GB'], colors: ['Verde', 'Gris', 'Oro', 'Plata'] },
    { name: 'iPhone XS', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro'] },
    { name: 'iPhone XS Max', capacities: ['64GB', '128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Oro'] },
    { name: 'iPhone XR', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Amarillo', 'Azul'] },
    { name: 'iPhone X', capacities: ['64GB', '256GB'], colors: ['Negro', 'Blanco'] },
    { name: 'iPhone 8', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro', 'Gris'] },
    { name: 'iPhone 8 Plus', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro', 'Gris'] },
    { name: 'iPhone 7', capacities: ['32GB', '128GB', '256GB'], colors: ['Negro', 'Rojo', 'Oro', 'Rosa'] },
    { name: 'iPhone 7 Plus', capacities: ['32GB', '128GB', '256GB'], colors: ['Negro', 'Rojo', 'Oro', 'Rosa'] },
    { name: 'iPhone 6', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro'] },
    { name: 'iPhone 6 Plus', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro'] },
    { name: 'iPhone 6s', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro', 'Rosa'] },
    { name: 'iPhone 6s Plus', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro', 'Rosa'] }
  ];

  const otherBrands = ['Samsung', 'Motorola', 'Xiaomi', 'Google Pixel', 'Honor', 'Oppo', 'OnePlus', 'TCL'];
  const paymentMethods = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Mercado Pago', 'Otro'];
  const movementTypes = ['Entrada', 'Venta', 'Salida manual', 'Devolución', 'Ajuste', 'Transferencia', 'Pérdida', 'Reparación'];

  return {
    capacities,
    colors,
    conditions,
    physicalStates,
    productConditions,
    locations,
    categories,
    iphoneModels,
    otherBrands,
    paymentMethods,
    movementTypes,
    version: '2026.1'
  };
})();
