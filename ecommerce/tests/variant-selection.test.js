import test from 'node:test';
import assert from 'node:assert/strict';
import { variantGroups } from '../public/js/ui.js';

/**
 * Selección de variantes. Al elegir un atributo se debe conservar el otro: si no,
 * marcar "512GB" y después un color salta a la primera variante de ese color y
 * el cliente pierde la capacidad que había elegido.
 */

const product = {
  id: 1,
  name: 'iPhone 17 Pro Max',
  variants: [
    { id: 11, capacity: '256GB', color: 'Azul profundo', availability: 'IN' },
    { id: 12, capacity: '512GB', color: 'Azul profundo', availability: 'IN' },
    { id: 13, capacity: '1TB', color: 'Azul profundo', availability: 'IN' },
    { id: 14, capacity: '256GB', color: 'Plata', availability: 'IN' },
    { id: 15, capacity: '512GB', color: 'Plata', availability: 'IN' },
    { id: 16, capacity: '1TB', color: 'Plata', availability: 'OUT' }
  ]
};

const groupFor = (groups, label) => groups.find((group) => group.label === label);
const optionFor = (groups, label, value) => groupFor(groups, label).options.find((option) => option.label === value);

test('choosing a colour keeps the selected capacity', () => {
  const selected = product.variants.find((variant) => variant.id === 13); // 1TB + Azul profundo
  const groups = variantGroups(product, selected);
  assert.equal(optionFor(groups, 'Color', 'Plata').variantId, 16, '1TB + Plata es la variante 16');
  assert.equal(optionFor(groups, 'Color', 'Azul profundo').variantId, 13);
});

test('choosing a capacity keeps the selected colour', () => {
  const selected = product.variants.find((variant) => variant.id === 12); // 512GB + Azul profundo
  const groups = variantGroups(product, selected);
  assert.equal(optionFor(groups, 'Capacidad', '256GB').variantId, 11);
  assert.equal(optionFor(groups, 'Capacidad', '1TB').variantId, 13);
  assert.equal(optionFor(groups, 'Capacidad', '512GB').variantId, 12);
});

test('an out-of-stock combination is offered but marked unavailable', () => {
  const selected = product.variants.find((variant) => variant.id === 15); // 512GB + Plata
  const groups = variantGroups(product, selected);
  const oneTb = optionFor(groups, 'Capacidad', '1TB');
  assert.equal(oneTb.unavailable, true, '1TB + Plata está agotado');
  assert.equal(oneTb.variantId, 16);
});

test('an unavailable colour never points at a different capacity silently', () => {
  const selected = product.variants.find((variant) => variant.id === 11); // 256GB + Azul profundo
  const groups = variantGroups(product, selected);
  // Para 1TB sólo existe Azul profundo (id 13), no Plata: debe apuntar a 13 y
  // marcarlo disponible, no caer a otra variante de otro color.
  assert.equal(optionFor(groups, 'Capacidad', '1TB').variantId, 13);
  assert.equal(optionFor(groups, 'Capacidad', '1TB').unavailable, false);
});

test('the groups are only the attributes the product actually has', () => {
  const single = { id: 2, name: 'AirPods', variants: [{ id: 21, capacity: '', color: 'Blanco', availability: 'IN' }] };
  const groups = variantGroups(single, single.variants[0]);
  assert.deepEqual(groups.map((group) => group.label), ['Color']);
});
