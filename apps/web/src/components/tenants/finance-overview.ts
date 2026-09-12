import { type FinanceOverviewResponseSchema } from '@plataforma/shared';
import { type z } from 'zod';

export type FinanceOverview = z.infer<typeof FinanceOverviewResponseSchema>;
export type FinanceSeriesPoint = FinanceOverview['series'][number];

export type FinancePeriod = 'today' | '7d' | '30d' | 'month' | 'previousMonth' | 'custom';

export const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'previousMonth', label: 'Mês anterior' },
  { value: 'custom', label: 'Personalizado' },
];

export const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const shift = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
};

/**
 * Período em dias civis (fim inclusivo). Quem resolve o instante é o servidor, no fuso
 * do estabelecimento — o navegador nunca decide onde o dia começa.
 */
export function periodRange(
  period: FinancePeriod,
  custom: { from: string; to: string },
  today = localDate(new Date()),
): { fromDate: string; toDate: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthStart = (() => {
    const value = new Date(`${monthStart}T12:00:00`);
    value.setMonth(value.getMonth() - 1);
    return `${localDate(value).slice(0, 7)}-01`;
  })();
  if (period === 'today') return { fromDate: today, toDate: today };
  if (period === '7d') return { fromDate: shift(today, -6), toDate: today };
  if (period === '30d') return { fromDate: shift(today, -29), toDate: today };
  if (period === 'month') return { fromDate: monthStart, toDate: today };
  if (period === 'previousMonth')
    return { fromDate: previousMonthStart, toDate: shift(monthStart, -1) };
  return { fromDate: custom.from, toDate: custom.to };
}

export const formatMoneyCents = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores altos ficam ilegíveis no eixo do gráfico: encurta mantendo a ordem de grandeza. */
export const formatCompactMoney = (cents: string | number) => {
  const value = Number(cents) / 100;
  if (Math.abs(value) >= 1000)
    return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Dia civil (YYYY-MM-DD) exibido sem passar por fuso — já é o dia do estabelecimento. */
export const formatDay = (day: string) =>
  `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');

/**
 * Variação percentual contra o período anterior. Devolve nulo quando não há base
 * comparável — nunca inventamos 100% em cima de zero.
 */
export function variation(current: string, previous: string | undefined): number | null {
  if (previous === undefined) return null;
  const before = Number(previous);
  const now = Number(current);
  if (!Number.isFinite(before) || !Number.isFinite(now) || before === 0) return null;
  return ((now - before) / before) * 100;
}

export const formatVariation = (value: number) =>
  `${value >= 0 ? '↑' : '↓'} ${Math.abs(value).toFixed(1).replace('.', ',')}%`;

export const variationTone = (value: number | null, invert = false) => {
  if (value === null || Math.abs(value) < 0.05) return 'neutral';
  const positive = invert ? value < 0 : value > 0;
  return positive ? 'up' : 'down';
};

export const percentOf = (part: string, total: string) => {
  const whole = Number(total);
  if (whole === 0) return '0%';
  return `${((Number(part) / whole) * 100).toFixed(1).replace('.', ',')}%`;
};

/** Pontos normalizados para o gráfico: altura relativa ao maior valor da série. */
export function seriesGeometry(series: FinanceSeriesPoint[]) {
  const max = series.reduce(
    (highest, point) =>
      Math.max(highest, Number(point.billedCents), Number(point.receivedCents)),
    0,
  );
  return {
    max,
    points: series.map((point) => ({
      ...point,
      billedRatio: max === 0 ? 0 : Number(point.billedCents) / max,
      receivedRatio: max === 0 ? 0 : Number(point.receivedCents) / max,
    })),
  };
}
