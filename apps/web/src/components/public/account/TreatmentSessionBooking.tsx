import { AvailabilityResponseSchema, PublicBookingConfirmationSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PushReminderCta } from '../PushReminderCta.js';
import {
  centsToBrl,
  dateFromIso,
  humanError,
  isoFromDate,
  todayIsoDate,
  type Site,
} from '../use-public-booking.js';
import { httpClient } from '../../../lib/http.js';

interface TreatmentSessionBookingProps {
  slug: string;
  site: Site;
  treatmentPublicId: string;
  sessionNumber: number;
  serviceName: string;
  professionalName: string;
  priceCents: string;
  recommendedDate?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TreatmentSessionBooking({
  slug,
  site,
  treatmentPublicId,
  sessionNumber,
  serviceName,
  professionalName,
  priceCents,
  recommendedDate,
  onSuccess,
  onCancel,
}: TreatmentSessionBookingProps) {
  const queryClient = useQueryClient();
  const [chosenDate, setChosenDate] = useState(recommendedDate?.slice(0, 10) ?? todayIsoDate());
  const [chosenTime, setChosenTime] = useState<string | null>(null);

  const slots = useQuery({
    queryKey: ['public', slug, 'treatment', treatmentPublicId, 'slots', chosenDate],
    queryFn: () =>
      httpClient.request(
        `/public/sites/${slug}/customer/treatment-plans/${treatmentPublicId}/availability/${chosenDate}`,
        { schema: AvailabilityResponseSchema },
      ),
    enabled: chosenDate !== '',
  });

  const schedule = useMutation({
    mutationFn: (startsAt: string) =>
      httpClient.request(
        `/public/sites/${slug}/customer/treatment-plans/${treatmentPublicId}/sessions`,
        {
          method: 'POST',
          body: { startsAt },
          schema: PublicBookingConfirmationSchema,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'treatments'],
      });
      onSuccess();
    },
  });

  const available = (slots.data?.slots ?? []).filter((slot) => slot.state === 'AVAILABLE');

  return (
    <div className="treatment-session-booking" role="dialog" aria-label={`Agendar sessão ${sessionNumber}`}>
      <div className="treatment-session-content">
        <h3>Agendar sessão {sessionNumber}</h3>

        <div className="treatment-session-info">
          <p>
            <strong>{serviceName}</strong>
          </p>
          <p className="treatment-session-professional">{professionalName}</p>
          <p className="treatment-session-price">{centsToBrl(priceCents)}</p>
        </div>

        {recommendedDate === null ? (
          <p className="customer-treatment__hint">Escolha o melhor dia para você.</p>
        ) : (
          <p className="customer-treatment__hint">
            Recomendada a partir de{' '}
            {new Date(recommendedDate).toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
            .
          </p>
        )}

        <label className="treatment-amount">
          Dia
          <input
            type="date"
            value={chosenDate}
            onChange={(event) => {
              setChosenDate(event.target.value);
              setChosenTime(null);
            }}
          />
        </label>

        {slots.isPending && chosenTime === null ? (
          <p className="customer-skeleton" aria-busy="true" />
        ) : null}

        {!slots.isPending && available.length === 0 ? (
          <p className="customer-treatment__hint">Nenhum horário livre neste dia. Escolha outra data.</p>
        ) : null}

        <div className="customer-treatment-slots">
          {available.map((slot) => (
            <button
              key={slot.startsAt}
              type="button"
              disabled={schedule.isPending}
              className={chosenTime === slot.startsAt ? 'selected' : ''}
              onClick={() => {
                setChosenTime(slot.startsAt);
              }}
            >
              {new Date(slot.startsAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </button>
          ))}
        </div>

        {schedule.error instanceof Error ? (
          <p className="public-form-error" role="alert">
            {humanError(schedule.error)}
          </p>
        ) : null}

        {chosenTime !== null && !schedule.isPending ? (
          <div className="treatment-session-confirmation">
            <p className="treatment-session-summary">
              <strong>
                {new Date(chosenTime).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </strong>
              {' às '}
              <strong>
                {new Date(chosenTime).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </p>
            <div className="ds-form-actions">
              <button
                className="customer-home-primary-cta"
                type="button"
                disabled={schedule.isPending}
                onClick={() => {
                  schedule.mutate(chosenTime);
                }}
              >
                {schedule.isPending ? 'Agendando…' : 'Confirmar agendamento'}
              </button>
              <button
                className="customer-home-secondary-cta"
                type="button"
                onClick={onCancel}
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="ds-form-actions">
            <button
              className="customer-home-secondary-cta"
              type="button"
              onClick={onCancel}
            >
              Fechar
            </button>
          </div>
        )}

        {schedule.data !== undefined ? <PushReminderCta appointment={schedule.data.appointment} /> : null}
      </div>
    </div>
  );
}
