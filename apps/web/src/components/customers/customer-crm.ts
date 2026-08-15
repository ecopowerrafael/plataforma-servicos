import { type CustomerListItemSchema, type CustomerSegmentSchema } from '@plataforma/shared';
import { type z } from 'zod';

export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;
export type CustomerListItem = z.infer<typeof CustomerListItemSchema>;

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  NEW: 'Novo',
  RECURRING: 'Recorrente',
  SCHEDULED: 'Com agendamento',
  NO_RETURN: 'Sem retorno',
  INACTIVE: 'Inativo',
};

export const SEGMENT_TONE: Record<CustomerSegment, 'info' | 'success' | 'warning' | 'danger'> = {
  NEW: 'info',
  RECURRING: 'success',
  SCHEDULED: 'info',
  NO_RETURN: 'warning',
  INACTIVE: 'danger',
};

/** Chips da lista: cada um é um segmento derivado real, mais o atalho "Todos". */
export const SEGMENT_CHIPS: { value: '' | CustomerSegment; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'SCHEDULED', label: 'Com agendamento' },
  { value: 'NEW', label: 'Novos' },
  { value: 'RECURRING', label: 'Recorrentes' },
  { value: 'NO_RETURN', label: 'Sem retorno' },
  { value: 'INACTIVE', label: 'Inativos' },
];

export const formatMoneyCents = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatShortDate = (iso: string | null) =>
  iso === null
    ? null
    : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatShortDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');

export const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/gu, '').replace(/^55/u, '');
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};

export const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/gu, '');
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
};

export const phoneLink = (phone: string) => `tel:${phone.replace(/[^\d+]/gu, '')}`;

/** Contato preferencial para WhatsApp: o número dedicado, senão o telefone. */
export const whatsappNumber = (customer: { whatsapp: string | null; phone: string | null }) =>
  customer.whatsapp ?? customer.phone;

export const pluralAppointments = (count: number) =>
  count === 1 ? '1 atendimento' : `${String(count)} atendimentos`;

/** "Cliente desde 2026" a partir da data de cadastro. */
export const customerSince = (createdAt: string) =>
  `Cliente desde ${String(new Date(createdAt).getFullYear())}`;

/** Frase única do relacionamento, sem inventar categoria que o domínio não tem. */
export function relationshipSummary(status: {
  daysSinceLastVisit: number | null;
  averageIntervalDays: number | null;
  noReturnAfterDays: number | null;
}): string {
  if (status.daysSinceLastVisit === null) return 'Ainda sem atendimento concluído.';
  const base =
    status.daysSinceLastVisit === 0
      ? 'Última visita hoje'
      : `Última visita há ${String(status.daysSinceLastVisit)} dia(s)`;
  if (status.averageIntervalDays === null) return `${base}.`;
  return `${base} · costuma voltar a cada ${String(status.averageIntervalDays)} dia(s).`;
}

export const TIMELINE_ICONS: Record<string, string> = {
  APPOINTMENT_CREATED: '＋',
  APPOINTMENT_STATUS: '✓',
  APPOINTMENT_RESCHEDULED: '⇄',
  CHECK_IN: '⌖',
  PAYMENT: '$',
  REVIEW: '★',
  LOYALTY: '◆',
};
