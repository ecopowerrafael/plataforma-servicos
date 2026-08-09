import {
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  ProfessionalPublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';

type Appointment = z.infer<typeof AppointmentPublicSchema>;

const statusLabel: Record<Appointment['status'], string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Falta',
};

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

interface AppointmentDetailProps {
  appointment: Appointment;
  busy: boolean;
  error: string | null;
  onSaveNotes: (notes: string) => void;
  onChangeStatus: (status: ProfessionalStatus, reason: string) => void;
}

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
    <div className="platform-form">
      <p>{`Duração: ${String(appointment.durationMinutes)} min`}</p>
      <p>{`Cliente: ${appointment.customerName}`}</p>
      {appointment.unitName !== null && <p>{`Unidade: ${appointment.unitName}`}</p>}
      <label>
        Observações do atendimento
        <textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
      </label>
      <button
        disabled={busy || notes === (appointment.notes ?? '')}
        type="button"
        onClick={() => {
          onSaveNotes(notes);
        }}
      >
        {busy ? 'Salvando…' : 'Salvar observações'}
      </button>
      {options.length > 0 && statusAction === null && (
        <div className="form-actions">
          {options.map((status) => (
            <button
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
      )}
      {statusAction !== null && (
        <div className="form-actions">
          {statusAction === 'NO_SHOW' && (
            <label>
              Motivo (opcional)
              <input
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
          )}
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              onChangeStatus(statusAction, reason.trim());
            }}
          >
            {busy ? 'Enviando…' : `Confirmar: ${nextStatusLabel[statusAction]}`}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setStatusAction(null);
            }}
          >
            Voltar
          </button>
        </div>
      )}
      {error !== null && (
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

  return (
    <section className="platform-form" aria-label="Minha agenda">
      <h3>Minha agenda</h3>
      {me.isPending ? <p>Carregando…</p> : null}
      {me.data !== undefined && (
        <>
          <p>{`Profissional: ${me.data.publicName}`}</p>
          <div className="form-actions">
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
              type="button"
              onClick={() => {
                setFrom(today());
                setTo(today());
              }}
            >
              Hoje
            </button>
          </div>
          {agenda.isPending ? <p>Carregando agenda…</p> : null}
          {agenda.error instanceof Error ? (
            <p className="form-error">Não foi possível carregar a agenda.</p>
          ) : null}
          {agenda.data?.items.length === 0 ? <p>Nenhum atendimento no período.</p> : null}
          <ul>
            {agenda.data?.items.map((appointment) => (
              <li key={appointment.publicId}>
                <strong>{appointment.protocol}</strong>
                <span>{new Date(appointment.startsAt).toLocaleString('pt-BR')}</span>
                <span>{appointment.serviceName}</span>
                <span>{appointment.customerName}</span>
                <span>{statusLabel[appointment.status]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(expanded === appointment.publicId ? null : appointment.publicId);
                  }}
                >
                  {expanded === appointment.publicId ? 'Fechar' : 'Detalhes'}
                </button>
                {expanded === appointment.publicId && (
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
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
