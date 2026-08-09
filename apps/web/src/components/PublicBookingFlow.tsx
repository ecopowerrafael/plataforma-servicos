import {
  AvailabilityResponseSchema,
  PublicBookingConfirmationSchema,
  PublicServiceProfessionalsResponseSchema,
  type PublicTenantSiteResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../lib/http.js';

type Site = z.infer<typeof PublicTenantSiteResponseSchema>;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PublicBookingFlow({ slug, site }: { slug: string; site: Site }) {
  const [unitPublicId, setUnitPublicId] = useState<string>(
    site.units[0]?.publicId !== undefined && site.units.length === 1 ? site.units[0].publicId : '',
  );
  const [servicePublicId, setServicePublicId] = useState('');
  const [professionalPublicId, setProfessionalPublicId] = useState('');
  const [date, setDate] = useState(todayIsoDate);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');

  const professionals = useQuery({
    queryKey: ['public-booking', slug, 'professionals', servicePublicId],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/services/${servicePublicId}/professionals`, {
        schema: PublicServiceProfessionalsResponseSchema,
      }),
    enabled: servicePublicId !== '',
    retry: false,
  });

  const availability = useQuery({
    queryKey: [
      'public-booking',
      slug,
      'availability',
      servicePublicId,
      professionalPublicId,
      date,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ date, professionalPublicId, servicePublicId });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/public/sites/${slug}/availability?${query.toString()}`, {
        schema: AvailabilityResponseSchema,
      });
    },
    enabled: servicePublicId !== '' && professionalPublicId !== '' && date !== '',
    retry: false,
  });

  const booking = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/bookings`, {
        method: 'POST',
        body: {
          unitPublicId: unitPublicId === '' ? null : unitPublicId,
          servicePublicId,
          professionalPublicId,
          startsAt: selectedSlot,
          notes: notes.trim() === '' ? null : notes.trim(),
          customer: {
            name: customerName,
            phone: customerPhone.trim() === '' ? null : customerPhone.trim(),
            email: customerEmail.trim() === '' ? null : customerEmail.trim(),
          },
        },
        schema: PublicBookingConfirmationSchema,
      }),
  });

  const selectedService = site.services.find((service) => service.publicId === servicePublicId);
  const errorMessage = (error: unknown) =>
    error instanceof HttpError ? error.message : error instanceof Error ? error.message : null;

  if (booking.isSuccess) {
    const confirmation = booking.data;
    return (
      <section className="public-cards" aria-live="polite">
        <article>
          <h3>{'Agendamento confirmado'}</h3>
          <p>
            {'Protocolo: '}
            <strong>{confirmation.protocol}</strong>
          </p>
          <p>{confirmation.serviceName}</p>
          <p>{confirmation.professionalName}</p>
          {confirmation.unitName === null ? null : <p>{confirmation.unitName}</p>}
          <p>{new Date(confirmation.startsAt).toLocaleString('pt-BR')}</p>
          <p>{`Status: ${confirmation.status}`}</p>
        </article>
      </section>
    );
  }

  return (
    <div className="platform-form">
      {site.units.length > 1 ? (
        <label>
          Unidade
          <select
            value={unitPublicId}
            onChange={(event) => {
              setUnitPublicId(event.target.value);
            }}
          >
            <option value="">Selecione</option>
            {site.units.map((unit) => (
              <option key={unit.publicId} value={unit.publicId}>
                {unit.name}
                {unit.isHeadquarters ? ' (matriz)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        {site.terminology.service.singular}
        <select
          value={servicePublicId}
          onChange={(event) => {
            setServicePublicId(event.target.value);
            setProfessionalPublicId('');
            setSelectedSlot(null);
          }}
        >
          <option value="">Selecione</option>
          {site.services.map((service) => (
            <option key={service.publicId} value={service.publicId}>
              {service.name}
              {` (${String(service.durationMinutes)} min)`}
            </option>
          ))}
        </select>
      </label>
      {servicePublicId === '' ? null : (
        <label>
          {site.terminology.professional.singular}
          {professionals.isPending ? (
            <p>{'Carregando profissionais\u2026'}</p>
          ) : (
            <select
              value={professionalPublicId}
              onChange={(event) => {
                setProfessionalPublicId(event.target.value);
                setSelectedSlot(null);
              }}
            >
              <option value="">Selecione</option>
              {professionals.data?.professionals.map((professional) => (
                <option key={professional.publicId} value={professional.publicId}>
                  {professional.name}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      {professionalPublicId === '' ? null : (
        <>
          <label>
            Data
            <input
              type="date"
              min={todayIsoDate()}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSelectedSlot(null);
              }}
            />
          </label>
          {availability.isPending ? <p>{'Consultando disponibilidade\u2026'}</p> : null}
          {availability.error instanceof Error ? (
            <p className="form-error">
              {'N\u00e3o foi poss\u00edvel consultar a disponibilidade.'}
            </p>
          ) : null}
          {availability.data !== undefined ? (
            <div className="public-cards">
              {availability.data.slots
                .filter((slot) => slot.state === 'AVAILABLE')
                .map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className={selectedSlot === slot.startsAt ? '' : 'secondary-button'}
                    onClick={() => {
                      setSelectedSlot(slot.startsAt);
                    }}
                  >
                    {new Date(slot.startsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </button>
                ))}
              {availability.data.slots.filter((slot) => slot.state === 'AVAILABLE').length === 0 ? (
                <p>Nenhum hor\u00e1rio dispon\u00edvel nesta data.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {selectedSlot === null ? null : (
        <form
          className="platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            booking.mutate();
          }}
        >
          <strong>{selectedService?.name}</strong>
          <p>{new Date(selectedSlot).toLocaleString('pt-BR')}</p>
          <label>
            Nome
            <input
              required
              value={customerName}
              onChange={(event) => {
                setCustomerName(event.target.value);
              }}
            />
          </label>
          <label>
            Telefone
            <input
              value={customerPhone}
              onChange={(event) => {
                setCustomerPhone(event.target.value);
              }}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => {
                setCustomerEmail(event.target.value);
              }}
            />
          </label>
          <label>
            Observa\u00e7\u00f5es
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </label>
          {booking.error instanceof Error ? (
            <p className="form-error">{errorMessage(booking.error)}</p>
          ) : null}
          <button disabled={booking.isPending} type="submit">
            {booking.isPending ? 'Confirmando\u2026' : 'Confirmar agendamento'}
          </button>
        </form>
      )}
    </div>
  );
}
