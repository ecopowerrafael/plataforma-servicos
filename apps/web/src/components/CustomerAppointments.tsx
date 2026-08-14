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

import { AppointmentStatusBadge } from './appointments/appointment-status.js';
import { httpClient, HttpError } from '../lib/http.js';

type Appointment = z.infer<typeof AppointmentPublicSchema>;

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

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

type Review = z.infer<typeof AppointmentReviewPublicSchema>;

interface AppointmentCardProps {
  appointment: Appointment;
  review: Review | undefined;
  onCancel: (reason: string) => void;
  onReschedule: (startsAt: string, reason: string) => void;
  onReview: (rating: number, comment: string) => void;
  busy: boolean;
  error: string | null;
}

/** Cartão do agendamento: as ações abrem um formulário dentro do próprio card. */
function AppointmentCard({
  appointment,
  review,
  onCancel,
  onReschedule,
  onReview,
  busy,
  error,
}: AppointmentCardProps) {
  const [action, setAction] = useState<'cancel' | 'reschedule' | 'review' | null>(null);
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(appointment.startsAt));
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const canCancel = cancelableStatuses.has(appointment.status);
  const canReschedule = rescheduleableStatuses.has(appointment.status);
  const canReview = appointment.status === 'COMPLETED';

  return (
    <article className="customer-appointment">
      <div className="customer-appointment-when">
        <strong>{timeLabel(appointment.startsAt)}</strong>
        <small>{dayLabel(appointment.startsAt)}</small>
      </div>
      <div className="customer-appointment-main">
        <div className="customer-appointment-head">
          <strong>{appointment.serviceName}</strong>
          <AppointmentStatusBadge status={appointment.status} />
        </div>
        <p className="customer-appointment-meta">
          <span>{appointment.professionalName}</span>
          {appointment.unitName === null ? null : <span>{appointment.unitName}</span>}
          {appointment.isFitIn ? <span className="customer-tag">Encaixe</span> : null}
        </p>
        {detailsOpen ? <small className="customer-appointment-protocol">{appointment.protocol}</small> : null}
        {detailsOpen && appointment.canceledReason !== null ? (
          <p className="customer-appointment-note">
            <span>Motivo do cancelamento</span>
            {appointment.canceledReason}
          </p>
        ) : null}
        {detailsOpen && appointment.rescheduleReason !== null ? (
          <p className="customer-appointment-note">
            <span>Motivo do reagendamento</span>
            {appointment.rescheduleReason}
          </p>
        ) : null}
        {detailsOpen && review !== undefined ? (
          <p className="customer-appointment-note">
            <span>{`Sua avaliação: ${String(review.rating)}/5`}</span>
            {review.comment}
          </p>
        ) : null}

        {action === null ? (
          <div className="customer-appointment-actions">
            <button className="public-link-button" type="button" onClick={() => { setDetailsOpen((open) => !open); }}>
              {detailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
            {canReschedule ? (
              <button
                className="public-secondary-button"
                type="button"
                onClick={() => {
                  setAction('reschedule');
                  setReason('');
                  setStartsAt(toDatetimeLocalValue(appointment.startsAt));
                }}
              >
                Reagendar
              </button>
            ) : null}
            {canCancel ? (
              <button
                className="public-link-button is-danger"
                type="button"
                onClick={() => {
                  setAction('cancel');
                  setReason('');
                }}
              >
                Cancelar
              </button>
            ) : null}
            {canReview ? (
              <button
                className="public-secondary-button"
                type="button"
                onClick={() => {
                  setAction('review');
                  setRating(review?.rating ?? 5);
                  setComment(review?.comment ?? '');
                }}
              >
                {review === undefined ? 'Avaliar' : 'Editar avaliação'}
              </button>
            ) : null}
          </div>
        ) : null}

        {action === 'cancel' ? (
          <div className="customer-appointment-form">
            <label>
              <span>Motivo do cancelamento</span>
              <input
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
            <div className="customer-appointment-actions">
              <button
                className="public-primary-button"
                disabled={busy || reason.trim().length < 2}
                type="button"
                onClick={() => {
                  onCancel(reason.trim());
                }}
              >
                {busy ? 'Enviando…' : 'Confirmar cancelamento'}
              </button>
              <button
                className="public-link-button"
                disabled={busy}
                type="button"
                onClick={() => {
                  setAction(null);
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        ) : null}

        {action === 'reschedule' ? (
          <div className="customer-appointment-form">
            <label>
              <span>Nova data e hora</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                }}
              />
            </label>
            <label>
              <span>Motivo do reagendamento</span>
              <input
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
            <div className="customer-appointment-actions">
              <button
                className="public-primary-button"
                disabled={busy || reason.trim().length < 2 || startsAt === ''}
                type="button"
                onClick={() => {
                  onReschedule(new Date(startsAt).toISOString(), reason.trim());
                }}
              >
                {busy ? 'Enviando…' : 'Confirmar reagendamento'}
              </button>
              <button
                className="public-link-button"
                disabled={busy}
                type="button"
                onClick={() => {
                  setAction(null);
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        ) : null}

        {action === 'review' ? (
          <div className="customer-appointment-form">
            <label>
              <span>Nota</span>
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
              <span>Comentário (opcional)</span>
              <input
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
              />
            </label>
            <div className="customer-appointment-actions">
              <button
                className="public-primary-button"
                disabled={busy}
                type="button"
                onClick={() => {
                  onReview(rating, comment.trim());
                }}
              >
                {busy ? 'Enviando…' : 'Enviar avaliação'}
              </button>
              <button
                className="public-link-button"
                disabled={busy}
                type="button"
                onClick={() => {
                  setAction(null);
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        ) : null}

        {error === null ? null : (
          <p className="public-form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
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
    <section className="customer-section" aria-label="Meus agendamentos">
      <div className="customer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'upcoming'}
          onClick={() => {
            setTab('upcoming');
          }}
        >
          Próximos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => {
            setTab('history');
          }}
        >
          Histórico
        </button>
      </div>

      {active.isPending ? (
        <div className="customer-skeleton-list" aria-busy="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {active.error instanceof Error ? (
        <p className="public-form-error" role="alert">
          Não foi possível carregar os agendamentos.
        </p>
      ) : null}
      {active.data?.items.length === 0 ? (
        <p className="customer-empty">
          {tab === 'upcoming' ? 'Nenhum agendamento futuro.' : 'Nenhum agendamento no histórico.'}
        </p>
      ) : null}

      <div className="customer-appointment-list">
        {active.data?.items.map((appointment) => (
          <AppointmentCard
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
      </div>
    </section>
  );
}
