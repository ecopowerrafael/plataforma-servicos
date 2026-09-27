import { type AppointmentPublicSchema } from '@plataforma/shared';
import { type z } from 'zod';

export type AppointmentStatus = z.infer<typeof AppointmentPublicSchema>['status'];

/** Rótulo único dos status, usado no painel e na área do cliente. */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Falta',
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`appointment-status appointment-status--${status.toLowerCase()}`}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
