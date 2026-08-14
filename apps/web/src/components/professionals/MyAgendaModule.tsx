import {
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  ProfessionalPublicSchema,
} from '@plataforma/shared';
import { IconCalendarOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';
import { AppointmentStatusBadge } from '../appointments/appointment-status.js';
import { EmptyState, InlineAlert, ListSkeleton, PageHeader, SectionCard } from '../ui/AppUi.js';

type Appointment = z.infer<typeof AppointmentPublicSchema>;

type ProfessionalStatus = 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';

const nextStatusOptions: Partial<Record<Appointment['status'], ProfessionalStatus[]>> = {
  CONFIRMED: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
};

const nextStatusLabel: Record<ProfessionalStatus, string> = {
  IN_PROGRESS: 'Iniciar atendimento',
  COMPLETED: 'Concluir atendimento',
  NO_SHOW: 'Marcar falta do cliente',
};

const today = () => new Date().toISOString().slice(0, 10);
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "Hoje — 14 de agosto" quando for o dia corrente. */
function dayTitle(key: string): string {
  const [year = '1970', month = '01', day = '01'] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const formatted = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return key === today() ? `Hoje — ${formatted}` : formatted;
}

interface AppointmentDetailProps {
  appointment: Appointment;
  busy: boolean;
  error: string | null;
  onSaveNotes: (notes: string) => void;
  onChangeStatus: (status: ProfessionalStatus, reason: string) => void;
}

/** Mesmas transições de antes: CONFIRMED → IN_PROGRESS/NO_SHOW, IN_PROGRESS → COMPLETED. */
function AppointmentDetail({
  appointment,
  busy,
  error,
  onSaveNotes,
  onChangeStatus,
}: AppointmentDetailProps) {
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [statusAction, setStatusAction] = useState<ProfessionalStatus | null>(null);
  const [reason, setReason] = useState('');

  const options = nextStatusOptions[appointment.status] ?? [];

  return (
    <div className="agenda-detail">
      <dl className="platform-details">
        <div>
          <dt>Cliente</dt>
          <dd>{appointment.customerName}</dd>
        </div>
        <div>
          <dt>Serviço</dt>
          <dd>{appointment.serviceName}</dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd>{`${timeLabel(appointment.startsAt)} – ${timeLabel(appointment.endsAt)}`}</dd>
        </div>
        <div>
          <dt>Duração</dt>
          <dd>{`${String(appointment.durationMinutes)} min`}</dd>
        </div>
        {appointment.unitName === null ? null : (
          <div>
            <dt>Unidade</dt>
            <dd>{appointment.unitName}</dd>
          </div>
        )}
      </dl>

      <label>
        Observações do atendimento
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
      </label>
      <div className="ds-form-actions">
        <button
          className="secondary-button"
          disabled={busy || notes === (appointment.notes ?? '')}
          type="button"
          onClick={() => {
            onSaveNotes(notes);
          }}
        >
          {busy ? 'Salvando…' : 'Salvar observações'}
        </button>
      </div>

      {options.length > 0 && statusAction === null ? (
        <div className="ds-form-actions">
          {options.map((status) => (
            <button
              className={status === 'NO_SHOW' ? 'secondary-button' : 'primary-button'}
              disabled={busy}
              key={status}
              type="button"
              onClick={() => {
                setStatusAction(status);
                setReason('');
              }}
            >
              {nextStatusLabel[status]}
            </button>
          ))}
        </div>
      ) : null}

      {statusAction !== null ? (
        <div className="agenda-status-form">
          {statusAction === 'NO_SHOW' ? (
            <label>
              Motivo (opcional)
              <input
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
          ) : null}
          <div className="ds-form-actions">
            <button
              className="primary-button"
              disabled={busy}
              type="button"
              onClick={() => {
                onChangeStatus(statusAction, reason.trim());
              }}
            >
              {busy ? 'Enviando…' : `Confirmar: ${nextStatusLabel[statusAction]}`}
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              type="button"
              onClick={() => {
                setStatusAction(null);
              }}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function MyAgendaModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me', {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const agendaQueryKey = ['tenant', tenantPublicId, 'professionals', 'me', 'agenda', from, to];
  const agenda = useQuery({
    queryKey: agendaQueryKey,
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/me/agenda?from=${new Date(`${from}T00:00:00.000Z`).toISOString()}&to=${new Date(`${to}T23:59:59.000Z`).toISOString()}`,
        { schema: AppointmentListResponseSchema, tenantPublicId },
      ),
    enabled: me.data !== undefined,
    retry: false,
  });

  const invalidateAgenda = () => queryClient.invalidateQueries({ queryKey: agendaQueryKey });

  const saveNotes = useMutation({
    mutationFn: ({ publicId, notes }: { publicId: string; notes: string }) =>
      httpClient.request(`/tenant/professionals/me/appointments/${publicId}/notes`, {
        method: 'PATCH',
        body: { notes: notes === '' ? null : notes },
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    onSuccess: invalidateAgenda,
  });

  const changeStatus = useMutation({
    mutationFn: ({
      publicId,
      status,
      reason,
    }: {
      publicId: string;
      status: ProfessionalStatus;
      reason: string;
    }) =>
      httpClient.request(
        `/tenant/professionals/me/appointments/${publicId}/${status.toLowerCase()}`,
        {
          method: 'POST',
          body: { reason: reason === '' ? undefined : reason },
          schema: AppointmentStatusResponseSchema,
          tenantPublicId,
        },
      ),
    onSuccess: invalidateAgenda,
  });

  if (me.error instanceof Error) return null;

  const busy = saveNotes.isPending || changeStatus.isPending;
  const mutationError = saveNotes.error ?? changeStatus.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  // Agrupamento por dia no frontend; a API continua devolvendo a lista plana.
  const days = [...(agenda.data?.items ?? [])]
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .reduce<Map<string, Appointment[]>>((accumulator, appointment) => {
      const key = dayKey(appointment.startsAt);
      accumulator.set(key, [...(accumulator.get(key) ?? []), appointment]);
      return accumulator;
    }, new Map());

  return (
    <div className="ds-stack my-agenda" aria-label="Minha agenda">
      <PageHeader
        eyebrow="Agenda"
        title="Minha agenda"
        description={
          me.data === undefined ? 'Seus atendimentos do período.' : me.data.publicName
        }
      />

      {me.isPending ? <ListSkeleton rows={3} /> : null}

      {me.data !== undefined && (
        <>
          <SectionCard title="Período" description="Escolha o intervalo que quer visualizar.">
            <div className="agenda-filters">
              <label>
                De
                <input
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setFrom(today());
                  setTo(today());
                }}
              >
                Hoje
              </button>
            </div>
          </SectionCard>

          {agenda.isPending ? <ListSkeleton rows={4} /> : null}
          {agenda.error instanceof Error ? (
            <InlineAlert
              tone="danger"
              title="Não foi possível carregar a agenda"
              action={
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void agenda.refetch()}
                >
                  Tentar novamente
                </button>
              }
            >
              Verifique sua conexão e tente novamente.
            </InlineAlert>
          ) : null}
          {agenda.data !== undefined && days.size === 0 ? (
            <EmptyState
              icon={<IconCalendarOff size={22} aria-hidden="true" />}
              title="Nenhum atendimento no período."
              description="Ajuste as datas acima para ver outros dias da sua agenda."
            />
          ) : null}

          {[...days.entries()].map(([key, items]) => (
            <SectionCard
              key={key}
              title={dayTitle(key)}
              description={`${String(items.length)} atendimento(s)`}
            >
              <div className="agenda-day">
                {items.map((appointment) => (
                  <article
                    className={`agenda-slot${expanded === appointment.publicId ? ' is-open' : ''}`}
                    key={appointment.publicId}
                  >
                    <div className="agenda-slot-row">
                      <span className="agenda-slot-time">
                        <strong>{timeLabel(appointment.startsAt)}</strong>
                        <small>{`${String(appointment.durationMinutes)} min`}</small>
                      </span>
                      <span className="agenda-slot-info">
                        <strong>{appointment.serviceName}</strong>
                        <small>{appointment.customerName}</small>
                        {appointment.unitName === null ? null : (
                          <small>{appointment.unitName}</small>
                        )}
                        <small className="agenda-slot-protocol">{appointment.protocol}</small>
                      </span>
                      <AppointmentStatusBadge status={appointment.status} />
                      <button
                        className="secondary-button button--sm"
                        type="button"
                        aria-expanded={expanded === appointment.publicId}
                        onClick={() => {
                          setExpanded(
                            expanded === appointment.publicId ? null : appointment.publicId,
                          );
                        }}
                      >
                        {expanded === appointment.publicId ? 'Fechar' : 'Ver detalhes'}
                      </button>
                    </div>
                    {expanded === appointment.publicId ? (
                      <AppointmentDetail
                        appointment={appointment}
                        busy={busy}
                        error={errorMessage}
                        onSaveNotes={(notes) => {
                          saveNotes.mutate({ publicId: appointment.publicId, notes });
                        }}
                        onChangeStatus={(status, reason) => {
                          changeStatus.mutate({ publicId: appointment.publicId, status, reason });
                        }}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
