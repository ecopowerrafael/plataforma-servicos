import {
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentReviewListResponseSchema,
  AppointmentReviewPublicSchema,
  AppointmentStatusResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../lib/http.js';

type Appointment = z.infer<typeof AppointmentPublicSchema>;

const statusLabel: Record<Appointment['status'], string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Falta',
};

const cancelableStatuses: ReadonlySet<Appointment['status']> = new Set([
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
]);
const rescheduleableStatuses: ReadonlySet<Appointment['status']> = new Set([
  'PENDING',
  'CONFIRMED',
]);

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type Review = z.infer<typeof AppointmentReviewPublicSchema>;

interface AppointmentRowProps {
  appointment: Appointment;
  review: Review | undefined;
  onCancel: (reason: string) => void;
  onReschedule: (startsAt: string, reason: string) => void;
  onReview: (rating: number, comment: string) => void;
  busy: boolean;
  error: string | null;
}

function AppointmentRow({
  appointment,
  review,
  onCancel,
  onReschedule,
  onReview,
  busy,
  error,
}: AppointmentRowProps) {
  const [action, setAction] = useState<'cancel' | 'reschedule' | 'review' | null>(null);
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(appointment.startsAt));
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [comment, setComment] = useState(review?.comment ?? '');

  const canCancel = cancelableStatuses.has(appointment.status);
  const canReschedule = rescheduleableStatuses.has(appointment.status);
  const canReview = appointment.status === 'COMPLETED';

  return (
    <li>
      <strong>{appointment.protocol}</strong>
      <span>{new Date(appointment.startsAt).toLocaleString('pt-BR')}</span>
      <span>{appointment.serviceName}</span>
      <span>{appointment.professionalName}</span>
      {appointment.unitName !== null && <span>{appointment.unitName}</span>}
      <span>{statusLabel[appointment.status]}</span>
      {appointment.isFitIn && <span>Encaixe</span>}
      {appointment.canceledReason !== null && (
        <span>{`Motivo do cancelamento: ${appointment.canceledReason}`}</span>
      )}
      {appointment.rescheduleReason !== null && (
        <span>{`Motivo do reagendamento: ${appointment.rescheduleReason}`}</span>
      )}
      {review !== undefined && (
        <span>{`Sua avaliação: ${String(review.rating)}/5${review.comment === null ? '' : ` — ${review.comment}`}`}</span>
      )}
      {(canCancel || canReschedule || canReview) && action === null && (
        <div className="form-actions">
          {canReschedule && (
            <button
              type="button"
              onClick={() => {
                setAction('reschedule');
                setReason('');
                setStartsAt(toDatetimeLocalValue(appointment.startsAt));
              }}
            >
              Reagendar
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => {
                setAction('cancel');
                setReason('');
              }}
            >
              Cancelar
            </button>
          )}
          {canReview && (
            <button
              type="button"
              onClick={() => {
                setAction('review');
                setRating(review?.rating ?? 5);
                setComment(review?.comment ?? '');
              }}
            >
              {review === undefined ? 'Avaliar' : 'Editar avaliação'}
            </button>
          )}
        </div>
      )}
      {action === 'cancel' && (
        <div className="form-actions">
          <label>
            Motivo do cancelamento
            <input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
          <button
            disabled={busy || reason.trim().length < 2}
            type="button"
            onClick={() => {
              onCancel(reason.trim());
            }}
          >
            {busy ? 'Enviando…' : 'Confirmar cancelamento'}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setAction(null);
            }}
          >
            Voltar
          </button>
        </div>
      )}
      {action === 'reschedule' && (
        <div className="form-actions">
          <label>
            Nova data e hora
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value);
              }}
            />
          </label>
          <label>
            Motivo do reagendamento
            <input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
          <button
            disabled={busy || reason.trim().length < 2 || startsAt === ''}
            type="button"
            onClick={() => {
              onReschedule(new Date(startsAt).toISOString(), reason.trim());
            }}
          >
            {busy ? 'Enviando…' : 'Confirmar reagendamento'}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setAction(null);
            }}
          >
            Voltar
          </button>
        </div>
      )}
      {action === 'review' && (
        <div className="form-actions">
          <label>
            Nota
            <select
              value={rating}
              onChange={(event) => {
                setRating(Number(event.target.value));
              }}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comentário (opcional)
            <input
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
            />
          </label>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              onReview(rating, comment.trim());
            }}
          >
            {busy ? 'Enviando…' : 'Enviar avaliação'}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setAction(null);
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
    </li>
  );
}

export function CustomerAppointments({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [activeAppointmentId, setActiveAppointmentId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['public', slug, 'customer', 'appointments'],
    });
  };

  const upcoming = useQuery({
    queryKey: ['public', slug, 'customer', 'appointments', 'upcoming'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/upcoming`, {
        schema: AppointmentListResponseSchema,
      }),
    enabled: tab === 'upcoming',
    retry: false,
  });

  const history = useQuery({
    queryKey: ['public', slug, 'customer', 'appointments', 'history'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/history`, {
        schema: AppointmentListResponseSchema,
      }),
    enabled: tab === 'history',
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: ({ publicId, reason }: { publicId: string; reason: string }) =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/${publicId}/cancel`, {
        method: 'POST',
        body: { reason },
        schema: AppointmentStatusResponseSchema,
      }),
    onSuccess: async () => {
      setActiveAppointmentId(null);
      await invalidate();
    },
  });

  const reschedule = useMutation({
    mutationFn: ({
      publicId,
      startsAt,
      reason,
    }: {
      publicId: string;
      startsAt: string;
      reason: string;
    }) =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/${publicId}/reschedule`, {
        method: 'PATCH',
        body: { startsAt, reason },
        schema: AppointmentPublicSchema,
      }),
    onSuccess: async () => {
      setActiveAppointmentId(null);
      await invalidate();
    },
  });

  const reviewsQueryKey = ['public', slug, 'customer', 'reviews'];
  const reviews = useQuery({
    queryKey: reviewsQueryKey,
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/reviews`, {
        schema: AppointmentReviewListResponseSchema,
      }),
    retry: false,
  });
  const reviewsByAppointment = new Map(
    reviews.data?.items.map((item) => [item.appointmentPublicId, item]) ?? [],
  );

  const review = useMutation({
    mutationFn: ({
      publicId,
      rating,
      comment,
      hasReview,
    }: {
      publicId: string;
      rating: number;
      comment: string;
      hasReview: boolean;
    }) =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/${publicId}/review`, {
        method: hasReview ? 'PATCH' : 'POST',
        body: { rating, comment: comment === '' ? null : comment },
        schema: AppointmentReviewPublicSchema,
      }),
    onSuccess: async () => {
      setActiveAppointmentId(null);
      await queryClient.invalidateQueries({ queryKey: reviewsQueryKey });
    },
  });

  const active = tab === 'upcoming' ? upcoming : history;
  const busy = cancel.isPending || reschedule.isPending || review.isPending;
  const mutationError = cancel.error ?? reschedule.error ?? review.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  return (
    <section className="platform-form" aria-label="Meus agendamentos">
      <h4>Meus agendamentos</h4>
      <div className="form-actions">
        <button
          disabled={tab === 'upcoming'}
          type="button"
          onClick={() => {
            setTab('upcoming');
          }}
        >
          Próximos horários
        </button>
        <button
          disabled={tab === 'history'}
          type="button"
          onClick={() => {
            setTab('history');
          }}
        >
          Histórico
        </button>
      </div>
      {active.isPending ? <p>Carregando agendamentos…</p> : null}
      {active.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os agendamentos.</p>
      ) : null}
      {active.data?.items.length === 0 ? (
        <p>
          {tab === 'upcoming' ? 'Nenhum agendamento futuro.' : 'Nenhum agendamento no histórico.'}
        </p>
      ) : null}
      <ul>
        {active.data?.items.map((appointment) => (
          <AppointmentRow
            appointment={appointment}
            busy={busy && activeAppointmentId === appointment.publicId}
            error={activeAppointmentId === appointment.publicId ? errorMessage : null}
            key={appointment.publicId}
            review={reviewsByAppointment.get(appointment.publicId)}
            onCancel={(reason) => {
              setActiveAppointmentId(appointment.publicId);
              cancel.mutate({ publicId: appointment.publicId, reason });
            }}
            onReschedule={(startsAt, reason) => {
              setActiveAppointmentId(appointment.publicId);
              reschedule.mutate({ publicId: appointment.publicId, startsAt, reason });
            }}
            onReview={(rating, comment) => {
              setActiveAppointmentId(appointment.publicId);
              review.mutate({
                publicId: appointment.publicId,
                rating,
                comment,
                hasReview: reviewsByAppointment.has(appointment.publicId),
              });
            }}
          />
        ))}
      </ul>
    </section>
  );
}
