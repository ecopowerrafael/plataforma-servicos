import { type AppointmentPaymentState } from '@plataforma/shared';

import { type AppointmentStatus } from '../appointments/appointment-status.js';

export type AgendaPeriod = 'day' | 'week' | 'month';

export const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

export const today = () => localDate(new Date());

export const isValidDate = (value: string | null): value is string => {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
};

export const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDate(value);
};

export const addMonths = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + amount);
  return localDate(value);
};

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

const monthEnd = (date: string) => {
  const value = new Date(`${monthStart(date)}T12:00:00`);
  value.setMonth(value.getMonth() + 1);
  value.setDate(0);
  return localDate(value);
};

/** Início da semana (segunda-feira) do dia informado. */
const weekStart = (date: string) => {
  const value = new Date(`${date}T12:00:00`);
  const weekday = (value.getDay() + 6) % 7;
  return addDays(date, -weekday);
};

/** Limites locais do período, já convertidos para ISO com offset — o backend filtra por instante. */
export const periodRange = (date: string, period: AgendaPeriod) => {
  const from =
    period === 'month' ? monthStart(date) : period === 'week' ? weekStart(date) : date;
  const to =
    period === 'month' ? monthEnd(date) : period === 'week' ? addDays(weekStart(date), 6) : date;
  return {
    fromDate: from,
    toDate: to,
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999`).toISOString(),
  };
};

export const periodLabel = (date: string, period: AgendaPeriod) => {
  const value = new Date(`${date}T12:00:00`);
  if (period === 'month')
    return value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  if (period === 'week') {
    const range = periodRange(date, 'week');
    const start = new Date(`${range.fromDate}T12:00:00`);
    const end = new Date(`${range.toDate}T12:00:00`);
    return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  }
  return value.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

export const formatMoneyCents = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/gu, '').replace(/^55/u, '');
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');

export const percentOf = (value: number, total: number) =>
  total === 0 ? '0%' : `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDING: '#a15c00',
  CONFIRMED: '#3157d5',
  IN_PROGRESS: '#7c3aed',
  COMPLETED: '#15803d',
  CANCELED: '#b42318',
  NO_SHOW: '#64748b',
};

export const PAYMENT_STATE_LABELS: Record<AppointmentPaymentState, string> = {
  PAID: 'Pago',
  PARTIAL: 'Parcial',
  ONLINE_PENDING: 'Pagamento pendente',
  ON_SITE: 'No local',
};

/**
 * Amarelo = receber no local, vermelho = cobrança online sem confirmação, verde = recebido.
 * Estado de pagamento é independente do status de atendimento.
 */
export const PAYMENT_STATE_TONE: Record<AppointmentPaymentState, 'success' | 'warning' | 'danger'> =
  {
    PAID: 'success',
    PARTIAL: 'warning',
    ONLINE_PENDING: 'danger',
    ON_SITE: 'warning',
  };
