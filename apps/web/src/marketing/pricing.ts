export function annualSavingsCents(monthlyPriceCents: string | null, annualPriceCents: string | null) {
  if (monthlyPriceCents === null || annualPriceCents === null) return 0;
  return Math.max(0, Number(monthlyPriceCents) * 12 - Number(annualPriceCents));
}

export function brazilianMoneyToCents(value: string) {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (normalized === '') return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

export function centsToBrazilianMoney(value: number | undefined) {
  return value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
}
