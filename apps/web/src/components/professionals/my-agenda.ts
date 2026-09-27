import {
  type AppointmentPublicSchema,
  type AvailabilitySlotSchema,
  type AppointmentPaymentState,
} from '@plataforma/shared';
import { type z } from 'zod';

export type Appointment = z.infer<typeof AppointmentPublicSchema>;
type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

/** Estados que não ocupam mais a agenda do profissional. */
const CLOSED_STATUSES = new Set<Appointment['status']>(['CANCELED', 'COMPLETED', 'NO_SHOW']);

export const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

export const today = () => localDate(new Date());

export const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDate(value);
};

/** Dia local do instante ISO — evita o deslocamento de fuso do slice(0, 10). */
export const dayKey = (iso: string) => localDate(new Date(iso));

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const weekdayShort = (date: string) =>
  new Date(`${date}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '')
    .replace(/^./u, (letter) => letter.toLocaleUpperCase('pt-BR'));

export const longDayLabel = (date: string) => {
  const formatted = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  return date === today() ? `Hoje · ${formatted}` : formatted;
};

export const durationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest).padStart(2, '0')}`;
};

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

export const isOpen = (appointment: Appointment) => !CLOSED_STATUSES.has(appointment.status);

/**
 * Atrasado: agendado para um horário que já passou e ainda não foi resolvido.
 * Só descreve a situação na tela — a máquina de estados continua a mesma.
 */
export const isOverdue = (appointment: Appointment, reference: Date = new Date()) =>
  (appointment.status === 'PENDING' || appointment.status === 'CONFIRMED') &&
  new Date(appointment.endsAt).getTime() <= reference.getTime();

/**
 * Próximo atendimento, em ordem de urgência: o que está em andamento, depois o atrasado
 * mais antigo e só então o próximo futuro. Nada some por ter passado do horário — sai do
 * card apenas quando vira COMPLETED, CANCELED ou NO_SHOW.
 */
export function nextAppointment(
  appointments: Appointment[],
  reference: Date = new Date(),
): Appointment | null {
  const byStart = (left: Appointment, right: Appointment) =>
    left.startsAt.localeCompare(right.startsAt);
  const open = appointments.filter(isOpen);
  const running = open.filter((item) => item.status === 'IN_PROGRESS').sort(byStart)[0];
  if (running !== undefined) return running;
  const late = open.filter((item) => isOverdue(item, reference)).sort(byStart)[0];
  if (late !== undefined) return late;
  return (
    open
      .filter((item) => new Date(item.endsAt).getTime() > reference.getTime())
      .sort(byStart)[0] ?? null
  );
}

export interface FreeBlock {
  startsAt: string;
  endsAt: string;
  minutes: number;
}

/**
 * Blocos livres reais do dia: parte dos slots AVAILABLE da disponibilidade (jornada,
 * bloqueios e agendamentos já considerados pelo AvailabilityService), une os contíguos
 * e descarta qualquer sobreposição com atendimento aberto e o que já passou.
 */
export function freeBlocks(
  slots: AvailabilitySlot[],
  appointments: Appointment[],
  reference: Date = new Date(),
): FreeBlock[] {
  const busy = appointments.filter(isOpen).map((item) => ({
    start: new Date(item.startsAt).getTime(),
    end: new Date(item.endsAt).getTime(),
  }));
  const available = slots
    .filter((slot) => slot.state === 'AVAILABLE')
    .map((slot) => ({
      start: new Date(slot.startsAt).getTime(),
      end: new Date(slot.endsAt).getTime(),
    }))
    .filter(
      (slot) =>
        slot.end > reference.getTime() &&
        !busy.some((item) => slot.start < item.end && slot.end > item.start),
    )
    .sort((left, right) => left.start - right.start);

  const merged: { start: number; end: number }[] = [];
  for (const slot of available) {
    const last = merged[merged.length - 1];
    if (last !== undefined && slot.start <= last.end) last.end = Math.max(last.end, slot.end);
    else merged.push({ ...slot });
  }
  return merged.map((block) => ({
    startsAt: new Date(block.start).toISOString(),
    endsAt: new Date(block.end).toISOString(),
    minutes: Math.round((block.end - block.start) / 60_000),
  }));
}

export type TimelineEntry =
  | { kind: 'appointment'; startsAt: string; appointment: Appointment }
  | { kind: 'free'; startsAt: string; block: FreeBlock };

/** Timeline do dia: atendimentos e janelas livres ordenados pelo horário de início. */
export function buildTimeline(appointments: Appointment[], blocks: FreeBlock[]): TimelineEntry[] {
  return [
    ...appointments.map<TimelineEntry>((appointment) => ({
      kind: 'appointment',
      startsAt: appointment.startsAt,
      appointment,
    })),
    ...blocks.map<TimelineEntry>((block) => ({
      kind: 'free',
      startsAt: block.startsAt,
      block,
    })),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

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

/** Ação principal disponível para o profissional, conforme o estado atual. */
export function primaryAction(
  status: Appointment['status'],
  canConfirm: boolean,
): { action: 'confirm' | 'start' | 'complete'; label: string } | null {
  if (status === 'PENDING')
    return canConfirm
      ? { action: 'confirm', label: 'Confirmar presença' }
      : { action: 'start', label: 'Iniciar atendimento' };
  if (status === 'CONFIRMED') return { action: 'start', label: 'Iniciar atendimento' };
  if (status === 'IN_PROGRESS') return { action: 'complete', label: 'Concluir atendimento' };
  return null;
}
