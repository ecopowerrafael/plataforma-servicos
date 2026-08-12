import { type AppointmentPublicSchema, type AvailabilitySlotSchema } from '@plataforma/shared';
import { type CSSProperties, type ReactNode } from 'react';
import { type z } from 'zod';

type Appointment = z.infer<typeof AppointmentPublicSchema>;
export type Slot = z.infer<typeof AvailabilitySlotSchema>;
export type AgendaView = 'day' | 'week' | 'month';

const statusLabels: Record<Appointment['status'], string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Não compareceu',
};

const time = (value: string) =>
  new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateKey = (value: string) => {
  const date = new Date(value);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function ScheduleStatusBadge({ status }: { status: Appointment['status'] }) {
  return (
    <span className={`agenda-status agenda-status--${status.toLowerCase()}`}>
      {statusLabels[status]}
    </span>
  );
}

export function AppointmentCard({
  item,
  compact = false,
  onOpen,
}: {
  item: Appointment;
  compact?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      className={`agenda-appointment${compact ? ' agenda-appointment--compact' : ''}`}
      type="button"
      style={
        {
          '--appointment-color': item.status === 'CANCELED' ? '#94a3b8' : '#2563eb',
        } as CSSProperties
      }
      onClick={() => {
        onOpen(item.publicId);
      }}
    >
      <span className="agenda-appointment-time">
        {time(item.startsAt)}–{time(item.endsAt)}
      </span>
      <strong>{item.customerName}</strong>
      <span>{item.serviceName}</span>
      {!compact && (
        <span>
          {item.professionalName} · {item.durationMinutes} min
        </span>
      )}
      <ScheduleStatusBadge status={item.status} />
    </button>
  );
}

export function AgendaSkeleton() {
  return (
    <div className="agenda-skeleton" aria-label="Carregando agenda">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function EmptyAgenda({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="agenda-empty">
      <span aria-hidden="true">◷</span>
      <strong>Nenhum agendamento para este período.</strong>
      <p>Você pode aproveitar para organizar sua agenda ou criar um novo atendimento.</p>
      <button className="primary-button" type="button" onClick={onCreate}>
        + Novo agendamento
      </button>
    </div>
  );
}

function CurrentTimeMarker({ date }: { date: string }) {
  if (date !== dateKey(new Date().toISOString())) return null;
  return (
    <div className="agenda-now">
      <span>{time(new Date().toISOString())} agora</span>
    </div>
  );
}

export function CalendarDay({
  date,
  appointments,
  slots,
  onOpen,
  onCreate,
}: {
  date: string;
  appointments: Appointment[];
  slots: Slot[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const rows = [
    ...appointments.map((item) => ({
      startsAt: item.startsAt,
      kind: 'appointment' as const,
      item,
    })),
    ...slots
      .filter(
        (slot) =>
          !appointments.some(
            (item) =>
              new Date(slot.startsAt) < new Date(item.endsAt) &&
              new Date(slot.endsAt) > new Date(item.startsAt),
          ),
      )
      .map((slot) => ({ startsAt: slot.startsAt, kind: 'slot' as const, slot })),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return (
    <section className="agenda-day" aria-label="Agenda do dia">
      <CurrentTimeMarker date={date} />
      {rows.length === 0 ? (
        <EmptyAgenda onCreate={onCreate} />
      ) : (
        rows.map((row) =>
          row.kind === 'appointment' ? (
            <div className="agenda-time-row" key={row.item.publicId}>
              <time>{time(row.item.startsAt)}</time>
              <AppointmentCard item={row.item} onOpen={onOpen} />
            </div>
          ) : (
            <div
              className={`agenda-time-row agenda-time-row--${row.slot.state.toLowerCase()}`}
              key={row.slot.startsAt}
            >
              <time>{time(row.slot.startsAt)}</time>
              <div className="agenda-slot">
                <strong>
                  {row.slot.state === 'AVAILABLE'
                    ? 'Horário livre'
                    : (row.slot.reason ??
                      (row.slot.state === 'BLOCKED' ? 'Bloqueado' : 'Indisponível'))}
                </strong>
                {row.slot.state !== 'AVAILABLE' && (
                  <span>
                    {time(row.slot.startsAt)}–{time(row.slot.endsAt)}
                  </span>
                )}
              </div>
            </div>
          ),
        )
      )}
    </section>
  );
}

export function CalendarWeek({
  dates,
  appointments,
  slotsByDate,
  onOpen,
  onSelectDay,
}: {
  dates: string[];
  appointments: Appointment[];
  slotsByDate: Record<string, Slot[]>;
  onOpen: (id: string) => void;
  onSelectDay: (date: string) => void;
}) {
  return (
    <div className="agenda-week" role="grid">
      {dates.map((date) => {
        const dayAppointments = appointments.filter((item) => dateKey(item.startsAt) === date);
        const unavailable = (slotsByDate[date] ?? []).filter((slot) => slot.state !== 'AVAILABLE');
        return (
          <section className="agenda-week-day" key={date} role="gridcell">
            <button
              className="agenda-week-heading"
              type="button"
              onClick={() => {
                onSelectDay(date);
              }}
            >
              <span>
                {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}
              </span>
              <strong>{date.slice(-2)}</strong>
            </button>
            <div>
              {dayAppointments.map((item) => (
                <AppointmentCard compact item={item} key={item.publicId} onOpen={onOpen} />
              ))}
              {unavailable.map((slot) => (
                <div className="agenda-week-block" key={slot.startsAt}>
                  {time(slot.startsAt)} · {slot.reason ?? 'Indisponível'}
                </div>
              ))}
              {dayAppointments.length === 0 && unavailable.length === 0 && (
                <span className="agenda-week-empty">Sem compromissos</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CalendarMonth({
  date,
  appointments,
  onSelectDay,
}: {
  date: string;
  appointments: Appointment[];
  onSelectDay: (date: string) => void;
}) {
  const first = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: lastDay },
      (_, index) => `${date.slice(0, 7)}-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
  return (
    <div className="agenda-month">
      <div className="agenda-month-weekdays">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="agenda-month-grid">
        {cells.map((cell, index) =>
          cell === null ? (
            <span className="agenda-month-blank" key={`blank-${String(index)}`} />
          ) : (
            (() => {
              const items = appointments.filter((item) => dateKey(item.startsAt) === cell);
              return (
                <button
                  className={`agenda-month-day${cell === dateKey(new Date().toISOString()) ? ' today' : ''}`}
                  type="button"
                  key={cell}
                  onClick={() => {
                    onSelectDay(cell);
                  }}
                >
                  <strong>{Number(cell.slice(-2))}</strong>
                  <span>
                    {items.length === 0
                      ? 'Sem agendamentos'
                      : `${String(items.length)} agendamento${items.length === 1 ? '' : 's'}`}
                  </span>
                  {items.slice(0, 3).map((item) => (
                    <i className={`status-${item.status.toLowerCase()}`} key={item.publicId} />
                  ))}
                </button>
              );
            })()
          ),
        )}
      </div>
    </div>
  );
}

export function AppointmentDrawer({
  item,
  loading,
  error,
  onClose,
  footer,
}: {
  item: Appointment | undefined;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="agenda-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="agenda-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do agendamento"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header>
          <div>
            <p>Detalhes do agendamento</p>
            <h3>{item?.customerName ?? 'Carregando…'}</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        {loading && <AgendaSkeleton />}
        {error && (
          <div className="agenda-inline-error">
            <strong>Não foi possível carregar os detalhes.</strong>
          </div>
        )}
        {item !== undefined && (
          <>
            <ScheduleStatusBadge status={item.status} />
            <dl>
              <div>
                <dt>Serviço</dt>
                <dd>{item.serviceName}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{item.professionalName}</dd>
              </div>
              <div>
                <dt>Data e horário</dt>
                <dd>
                  {new Date(item.startsAt).toLocaleString('pt-BR')}–{time(item.endsAt)}
                </dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{item.durationMinutes} min</dd>
              </div>
              <div>
                <dt>Unidade</dt>
                <dd>{item.unitName ?? 'Não informada'}</dd>
              </div>
              {item.notes !== null && (
                <div>
                  <dt>Observações</dt>
                  <dd>{item.notes}</dd>
                </div>
              )}
            </dl>
            {footer}
          </>
        )}
      </aside>
    </div>
  );
}
