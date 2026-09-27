import { type AppointmentPaymentState } from '@plataforma/shared';
import { IconBrandWhatsapp, IconClockPlus, IconDots, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

import {
  durationLabel,
  formatPhone,
  initials,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONE,
  isOverdue,
  primaryAction,
  timeLabel,
  whatsappLink,
  type Appointment,
  type FreeBlock,
  type TimelineEntry,
} from './my-agenda.js';
import { AppointmentStatusBadge } from '../appointments/appointment-status.js';

export interface MyAgendaPermissions {
  canConfirm: boolean;
  canCheckIn: boolean;
  canCancel: boolean;
  canCreate: boolean;
  canReadCustomers: boolean;
  canReadPayments: boolean;
  canManagePayments: boolean;
}

export interface MyAgendaHandlers {
  onPrimary: (appointment: Appointment, action: 'confirm' | 'start' | 'complete') => void;
  onCheckIn: (appointment: Appointment) => void;
  onNoShow: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onReschedule: (appointment: Appointment) => void;
  onOpenCustomer: (appointment: Appointment) => void;
  onNotes: (appointment: Appointment) => void;
  onPayment: (appointment: Appointment) => void;
  onCreateAt: (block: FreeBlock) => void;
}

function PaymentBadge({ state }: { state: AppointmentPaymentState }) {
  return (
    <span className={`ds-badge ds-badge--${PAYMENT_STATE_TONE[state]}`}>
      {PAYMENT_STATE_LABELS[state]}
    </span>
  );
}

function AppointmentMenu({
  appointment,
  permissions,
  handlers,
}: {
  appointment: Appointment;
  permissions: MyAgendaPermissions;
  handlers: MyAgendaHandlers;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const closed =
    appointment.status === 'CANCELED' ||
    appointment.status === 'COMPLETED' ||
    appointment.status === 'NO_SHOW';
  return (
    <div className="my-agenda-menu">
      <button
        className="secondary-button button--sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais ações"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <IconDots size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul className="my-agenda-menu-list" role="menu">
          {permissions.canReadCustomers && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  handlers.onOpenCustomer(appointment);
                })}
              >
                Ver cliente
              </button>
            </li>
          )}
          {permissions.canCheckIn && appointment.checkedInAt === null && !closed && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  handlers.onCheckIn(appointment);
                })}
              >
                Cliente chegou
              </button>
            </li>
          )}
          {permissions.canReadCustomers && appointment.customerPhone !== null && (
            <li>
              <a
                role="menuitem"
                href={whatsappLink(appointment.customerPhone)}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  setOpen(false);
                }}
              >
                <IconBrandWhatsapp size={15} aria-hidden="true" /> Abrir conversa no WhatsApp
              </a>
            </li>
          )}
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={run(() => {
                handlers.onNotes(appointment);
              })}
            >
              Adicionar observação
            </button>
          </li>
          {permissions.canManagePayments && !closed && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  handlers.onPayment(appointment);
                })}
              >
                Registrar pagamento
              </button>
            </li>
          )}
          {permissions.canCreate && !closed && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  handlers.onReschedule(appointment);
                })}
              >
                Reagendar
              </button>
            </li>
          )}
          {!closed && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  handlers.onNoShow(appointment);
                })}
              >
                Marcar falta do cliente
              </button>
            </li>
          )}
          {permissions.canCancel && !closed && (
            <li>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={run(() => {
                  handlers.onCancel(appointment);
                })}
              >
                Cancelar
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function MyAgendaCustomer({
  appointment,
  permissions,
  onOpen,
}: {
  appointment: Appointment;
  permissions: MyAgendaPermissions;
  onOpen: () => void;
}) {
  return (
    <div className="my-agenda-customer">
      <span className="my-agenda-avatar" aria-hidden="true">
        {initials(appointment.customerName)}
      </span>
      <span>
        {permissions.canReadCustomers ? (
          <button className="text-button" type="button" onClick={onOpen}>
            {appointment.customerName}
          </button>
        ) : (
          <strong>{appointment.customerName}</strong>
        )}
        {permissions.canReadCustomers && appointment.customerPhone !== null && (
          <small>{formatPhone(appointment.customerPhone)}</small>
        )}
      </span>
    </div>
  );
}

/** Card destacado do próximo atendimento — o card assume sozinho o compromisso seguinte. */
export function MyAgendaNextCard({
  appointment,
  paymentState,
  permissions,
  handlers,
  busy,
}: {
  appointment: Appointment;
  paymentState: AppointmentPaymentState | undefined;
  permissions: MyAgendaPermissions;
  handlers: MyAgendaHandlers;
  busy: boolean;
}) {
  const primary = primaryAction(appointment.status, permissions.canConfirm);
  return (
    <article className="my-agenda-next" aria-label="Próximo atendimento">
      <p className="ds-eyebrow">Próximo atendimento</p>
      <strong className="my-agenda-next-time">{timeLabel(appointment.startsAt)}</strong>
      <MyAgendaCustomer
        appointment={appointment}
        permissions={permissions}
        onOpen={() => {
          handlers.onOpenCustomer(appointment);
        }}
      />
      <p className="my-agenda-next-service">
        {appointment.serviceName} · {durationLabel(appointment.durationMinutes)}
      </p>
      <div className="my-agenda-badges">
        <AppointmentStatusBadge status={appointment.status} />
        {isOverdue(appointment) && <span className="ds-badge ds-badge--danger">Atrasado</span>}
        {paymentState !== undefined && <PaymentBadge state={paymentState} />}
      </div>
      <div className="my-agenda-actions">
        {primary !== null && (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => {
              handlers.onPrimary(appointment, primary.action);
            }}
          >
            {primary.label}
          </button>
        )}
        <AppointmentMenu appointment={appointment} permissions={permissions} handlers={handlers} />
      </div>
    </article>
  );
}

export function MyAgendaTimeline({
  entries,
  paymentStates,
  permissions,
  handlers,
  busy,
  notesFor,
  notesSlot,
  treatmentSlot,
}: {
  entries: TimelineEntry[];
  paymentStates: Map<string, AppointmentPaymentState>;
  permissions: MyAgendaPermissions;
  handlers: MyAgendaHandlers;
  busy: boolean;
  notesFor: string | null;
  notesSlot: (appointment: Appointment) => React.ReactNode;
  /** Bloco de orçamento/tratamento; só aparece em avaliações e sessões. */
  treatmentSlot?: (appointment: Appointment) => React.ReactNode;
}) {
  return (
    <ol className="my-agenda-timeline">
      {entries.map((entry) => {
        if (entry.kind === 'free')
          return (
            <li className="my-agenda-entry my-agenda-entry--free" key={`free-${entry.startsAt}`}>
              <span className="my-agenda-time">{timeLabel(entry.startsAt)}</span>
              <div className="my-agenda-body">
                <p className="my-agenda-free-label">
                  <IconClockPlus size={16} aria-hidden="true" /> Horário livre ·{' '}
                  {durationLabel(entry.block.minutes)}
                </p>
                {permissions.canCreate && (
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      handlers.onCreateAt(entry.block);
                    }}
                  >
                    <IconPlus size={15} aria-hidden="true" /> Novo agendamento
                  </button>
                )}
              </div>
            </li>
          );
        const appointment = entry.appointment;
        const primary = primaryAction(appointment.status, permissions.canConfirm);
        const paymentState = paymentStates.get(appointment.publicId);
        return (
          <li
            className={`my-agenda-entry my-agenda-entry--${appointment.status.toLowerCase()}`}
            key={appointment.publicId}
          >
            <span className="my-agenda-time">{timeLabel(appointment.startsAt)}</span>
            <div className="my-agenda-body">
              <MyAgendaCustomer
                appointment={appointment}
                permissions={permissions}
                onOpen={() => {
                  handlers.onOpenCustomer(appointment);
                }}
              />
              <p className="my-agenda-service">
                {appointment.serviceName} · {durationLabel(appointment.durationMinutes)}
              </p>
              <div className="my-agenda-badges">
                <AppointmentStatusBadge status={appointment.status} />
                {isOverdue(appointment) && (
                  <span className="ds-badge ds-badge--danger">Atrasado</span>
                )}
                {paymentState !== undefined && <PaymentBadge state={paymentState} />}
              </div>
              <div className="my-agenda-actions">
                {primary !== null && (
                  <button
                    className="primary-button button--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      handlers.onPrimary(appointment, primary.action);
                    }}
                  >
                    {primary.label}
                  </button>
                )}
                <AppointmentMenu
                  appointment={appointment}
                  permissions={permissions}
                  handlers={handlers}
                />
              </div>
              {treatmentSlot?.(appointment)}
              {notesFor === appointment.publicId && notesSlot(appointment)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
