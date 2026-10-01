export function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100);
}

export function fromCents(value) {
  return Math.round(Number(value) || 0) / 100;
}

export function formatUsd(centsValue) {
  return `US$ ${fromCents(centsValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function percentageOf(amountCents, percent) {
  return Math.round((Number(amountCents) * Number(percent)) / 100);
}

export function clampDiscount(amountCents, discountCents) {
  return Math.max(0, Math.min(Number(amountCents), Math.round(Number(discountCents))));
}
