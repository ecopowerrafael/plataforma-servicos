import {
  type CashMovementPublicSchema,
  type CashRegisterPublicSchema,
  type DelinquentAppointmentSchema,
  type FinancialClosingPublicSchema,
} from '@plataforma/shared';
import { type z } from 'zod';

export type CashRegister = z.infer<typeof CashRegisterPublicSchema>;
export type CashMovement = z.infer<typeof CashMovementPublicSchema>;
export type Receivable = z.infer<typeof DelinquentAppointmentSchema>;
export type FinancialClosing = z.infer<typeof FinancialClosingPublicSchema>;
export type ReceivableState = Receivable['state'];

export const formatMoneyCents = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor com sinal explícito para leitura rápida de entrada e saída. */
export const formatSignedMoney = (cents: string | number, direction: 'IN' | 'OUT') =>
  `${direction === 'IN' ? '+' : '−'} ${formatMoneyCents(cents)}`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const initials = (value: string) =>
  value
    .trim()
    .split(/[\s@.]+/u)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');

/** Converte "35,90" ou "35.90" em centavos inteiros. */
export const toCents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);

export const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

/** Rótulo do movimento: recebimento é entrada gerada por pagamento, não lançamento manual. */
export const movementLabel = (movement: Pick<CashMovement, 'type' | 'direction'>) =>
  movement.type === 'PAYMENT'
    ? 'Recebimento'
    : movement.direction === 'IN'
      ? 'Entrada'
      : 'Saída';

export const movementDescription = (movement: CashMovement) => {
  if (movement.type === 'PAYMENT') {
    const service = movement.serviceName ?? 'Atendimento';
    return movement.customerName === null ? service : `${service} · ${movement.customerName}`;
  }
  return movement.reason ?? 'Movimentação manual';
};

export type CashMovementFilter = 'ALL' | 'IN' | 'OUT' | 'PAYMENT';

export const CASH_FILTERS: { value: CashMovementFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'IN', label: 'Entradas' },
  { value: 'OUT', label: 'Saídas' },
  { value: 'PAYMENT', label: 'Recebimentos' },
];

export function filterMovements(movements: CashMovement[], filter: CashMovementFilter) {
  if (filter === 'ALL') return movements;
  if (filter === 'PAYMENT') return movements.filter((item) => item.type === 'PAYMENT');
  return movements.filter((item) => item.direction === filter && item.type === 'MANUAL');
}

/** Saldo esperado do fechamento de caixa, na mesma conta que o backend faz. */
export const expectedBalance = (register: CashRegister) =>
  (
    BigInt(register.openingBalanceCents) +
    BigInt(register.totalInCents) -
    BigInt(register.totalOutCents)
  ).toString();

export const RECEIVABLE_LABELS: Record<ReceivableState, string> = {
  ONLINE_PENDING: 'Online aguardando',
  ONLINE_FAILED: 'Falha/expirada',
  ON_SITE: 'No local',
};

export const RECEIVABLE_TONE: Record<ReceivableState, 'info' | 'danger' | 'warning'> = {
  ONLINE_PENDING: 'info',
  ONLINE_FAILED: 'danger',
  ON_SITE: 'warning',
};

export const RECEIVABLE_CHIPS: { value: '' | ReceivableState; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'ONLINE_PENDING', label: 'Online aguardando' },
  { value: 'ONLINE_FAILED', label: 'Falha/expirada' },
  { value: 'ON_SITE', label: 'No local' },
];

export const CLOSING_STATUS_LABELS: Record<FinancialClosing['status'], string> = {
  ACTIVE: 'Ativo',
  CANCELED: 'Cancelado',
};

/** Período do fechamento em uma linha legível. */
export const closingPeriod = (closing: Pick<FinancialClosing, 'periodFrom' | 'periodTo'>) =>
  `${formatShortDate(closing.periodFrom)} — ${formatShortDate(closing.periodTo)}`;
