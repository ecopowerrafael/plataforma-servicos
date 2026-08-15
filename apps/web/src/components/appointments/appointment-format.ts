import { type AppointmentPaymentState } from '@plataforma/shared';

/** Formatadores centrais da gestão de agendamentos — nada de enum cru na tela. */
export const formatMoneyCents = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Rótulo do dia relativo: "Hoje", "Amanhã" ou a data. */
export const formatDayLabel = (iso: string) => {
  const day = new Date(iso);
  const reference = new Date();
  const diff = Math.round(
    (new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() -
      new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime()) /
      86_400_000,
  );
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return formatDate(iso);
};

export const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest).padStart(2, '0')}`;
};

/** Origens realmente gravadas no domínio; qualquer outra é mostrada como veio. */
const SOURCE_LABELS: Record<string, string> = {
  INTERNAL: 'Painel',
  MANUAL: 'Painel',
  PUBLIC_BOOKING: 'Site',
  CUSTOMER_PORTAL: 'Área do cliente',
  WAITLIST: 'Lista de espera',
};

export const formatSource = (source: string) => SOURCE_LABELS[source] ?? source;

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

/** Mesma regra da Visão da Agenda: atendimento e pagamento são estados independentes. */
export const PAYMENT_STATE_LABELS: Record<AppointmentPaymentState, string> = {
  PAID: 'Pago',
  PARTIAL: 'Parcial',
  ONLINE_PENDING: 'Pagamento pendente',
  ON_SITE: 'No local',
};

export const PAYMENT_STATE_TONE: Record<AppointmentPaymentState, 'success' | 'warning' | 'danger'> =
  {
    PAID: 'success',
    PARTIAL: 'warning',
    ONLINE_PENDING: 'danger',
    ON_SITE: 'warning',
  };

export const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

/** Período de consulta a partir do atalho escolhido, em ISO com fuso local. */
export type PeriodPreset = 'today' | 'week' | 'month' | 'past' | 'custom';

export function periodRange(
  preset: PeriodPreset,
  custom: { from: string; to: string },
): { from: string; to: string } {
  const now = new Date();
  const day = localDate(now);
  const shift = (date: string, amount: number) => {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + amount);
    return localDate(value);
  };
  const range =
    preset === 'today'
      ? { from: day, to: day }
      : preset === 'week'
        ? { from: day, to: shift(day, 6) }
        : preset === 'month'
          ? { from: day, to: shift(day, 29) }
          : preset === 'past'
            ? { from: shift(day, -30), to: day }
            : custom;
  return {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    to: new Date(`${range.to}T23:59:59.999`).toISOString(),
  };
}

/** Ações permitidas na linha, cruzando estado do agendamento com RBAC. */
export interface AppointmentAbilities {
  canManageStatus: boolean;
  canCheckIn: boolean;
  canCreate: boolean;
  canReadCustomers: boolean;
  canManagePayments: boolean;
}

export type AppointmentAction =
  | 'confirm'
  | 'checkin'
  | 'start'
  | 'complete'
  | 'payment'
  | 'reschedule'
  | 'cancel'
  | 'no_show'
  | 'customer'
  | 'whatsapp'
  | 'notes';

export function availableActions(
  appointment: {
    status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
    checkedInAt: string | null;
    customerPhone: string | null;
  },
  abilities: AppointmentAbilities,
): AppointmentAction[] {
  const closed =
    appointment.status === 'COMPLETED' ||
    appointment.status === 'CANCELED' ||
    appointment.status === 'NO_SHOW';
  const actions: AppointmentAction[] = [];
  if (abilities.canManageStatus && appointment.status === 'PENDING') actions.push('confirm');
  if (
    abilities.canCheckIn &&
    !closed &&
    appointment.checkedInAt === null &&
    appointment.status !== 'IN_PROGRESS'
  )
    actions.push('checkin');
  if (
    abilities.canManageStatus &&
    (appointment.status === 'PENDING' || appointment.status === 'CONFIRMED')
  )
    actions.push('start');
  if (abilities.canManageStatus && !closed) actions.push('complete');
  if (abilities.canManagePayments && appointment.status !== 'CANCELED') actions.push('payment');
  if (abilities.canCreate && !closed) actions.push('reschedule');
  if (abilities.canManageStatus && !closed) actions.push('no_show', 'cancel');
  if (abilities.canReadCustomers) actions.push('customer');
  if (abilities.canReadCustomers && appointment.customerPhone !== null) actions.push('whatsapp');
  if (abilities.canCreate) actions.push('notes');
  return actions;
}

export const ACTION_LABELS: Record<AppointmentAction, string> = {
  confirm: 'Confirmar presença',
  checkin: 'Cliente chegou',
  start: 'Iniciar atendimento',
  complete: 'Concluir atendimento',
  payment: 'Registrar pagamento',
  reschedule: 'Reagendar',
  cancel: 'Cancelar',
  no_show: 'Marcar falta',
  customer: 'Abrir cliente',
  whatsapp: 'Abrir conversa no WhatsApp',
  notes: 'Adicionar observação',
};
