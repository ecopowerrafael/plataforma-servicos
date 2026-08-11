import {
  AvailabilityResponseSchema,
  AppointmentListResponseSchema,
  CalendarResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
};
const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return isoDate(value);
};
const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const endOfMonth = (date: string) => {
  const value = new Date(`${startOfMonth(date)}T12:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return isoDate(value);
};

type CalendarView = 'day' | 'week' | 'month';

export function CalendarModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [view, setView] = useState<CalendarView>('day');
  const weekly = view === 'week';
  const [professionalPublicId, setProfessionalPublicId] = useState('');
  const [servicePublicId, setServicePublicId] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'calendar'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'calendar'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const range = useMemo(
    () => ({
      from: view === 'month' ? startOfMonth(date) : date,
      to: view === 'month' ? endOfMonth(date) : weekly ? addDays(date, 6) : date,
    }),
    [date, view, weekly],
  );
  const calendar = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'calendar',
      range,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ ...range, professionalPublicId, servicePublicId });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/calendar?${query.toString()}`, {
        schema: CalendarResponseSchema,
        tenantPublicId,
      });
    },
    enabled: professionalPublicId !== '' && servicePublicId !== '',
    retry: false,
  });
  const availability = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'availability',
      date,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ date, professionalPublicId, servicePublicId });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/availability?${query.toString()}`, {
        schema: AvailabilityResponseSchema,
        tenantPublicId,
      });
    },
    enabled: view === 'day' && professionalPublicId !== '' && servicePublicId !== '',
    retry: false,
  });
  const appointments = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      'calendar',
      range,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({
        from: new Date(`${range.from}T00:00:00.000Z`).toISOString(),
        to: new Date(`${range.to}T23:59:59.999Z`).toISOString(),
      });
      if (professionalPublicId !== '') query.set('professionalPublicId', professionalPublicId);
      if (servicePublicId !== '') query.set('servicePublicId', servicePublicId);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/appointments?${query.toString()}`, {
        schema: AppointmentListResponseSchema,
        tenantPublicId,
      });
    },
    enabled: professionalPublicId !== '' && servicePublicId !== '',
    retry: false,
  });
  const data =
    view === 'day'
      ? availability.data === undefined
        ? undefined
        : [{ date, slots: availability.data.slots }]
      : calendar.data?.days;
  const isLoading = view === 'day' ? availability.isPending : calendar.isPending;
  const hasError =
    view === 'day' ? availability.error instanceof Error : calendar.error instanceof Error;
  return (
    <section className="sessions-panel calendar-module" aria-labelledby="calendar-title">
      <div className="module-header"><div><p className="eyebrow">Agenda</p><h2 id="calendar-title">Disponibilidade</h2><p>Consulte os horários livres antes de criar um novo atendimento.</p></div></div>
      <div className="app-filter-bar">
        <label>
          Profissional
          <select
            value={professionalPublicId}
            onChange={(event) => {
              setProfessionalPublicId(event.target.value);
            }}
          >
            <option value="">Selecione</option>
            {professionals.data?.items.map((professional) => (
              <option value={professional.publicId} key={professional.publicId}>
                {professional.publicName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Serviço
          <select
            value={servicePublicId}
            onChange={(event) => {
              setServicePublicId(event.target.value);
            }}
          >
            <option value="">Selecione</option>
            {services.data?.items.map((service) => (
              <option value={service.publicId} key={service.publicId}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <UnitSelect
            tenantPublicId={tenantPublicId}
            value={unitPublicId}
            onChange={(value) => {
              setUnitPublicId(value);
            }}
          />
        </label>
      </div>
      <div className="form-actions calendar-toolbar">
        <button
          type="button"
          onClick={() => {
            setDate((value) =>
              view === 'month' ? addMonths(value, -1) : addDays(value, weekly ? -7 : -1),
            );
          }}
        >
          Anterior
        </button>
        <label>
          Data
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setDate((value) =>
              view === 'month' ? addMonths(value, 1) : addDays(value, weekly ? 7 : 1),
            );
          }}
        >
          Próxima
        </button>
        {(['day', 'week', 'month'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={view === option ? '' : 'secondary-button'}
            onClick={() => {
              setView(option);
            }}
          >
            {option === 'day' ? 'Dia' : option === 'week' ? 'Semana' : 'Mês'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p>Carregando disponibilidade…</p>
      ) : hasError ? (
        <p className="form-error">Não foi possível carregar a agenda.</p>
      ) : professionalPublicId === '' || servicePublicId === '' ? (
        <div className="empty-state"><strong>Escolha profissional e serviço</strong><span>Com os filtros definidos, os horários disponíveis aparecerão aqui.</span></div>
      ) : (
        <div className="data-list">
          {data?.map((day) => (
            <article className="sessions-panel" key={day.date}>
              <h3>{new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString('pt-BR')}</h3>
              {day.slots.length === 0 ? (
                <p>Sem jornada configurada.</p>
              ) : (
                <>
                  {appointments.data?.items
                    .filter((appointment) => appointment.startsAt.slice(0, 10) === day.date)
                    .map((appointment) => (
                      <div
                        className="data-row calendar-slot calendar-slot--blocked"
                        key={appointment.publicId}
                      >
                        <span>
                          {new Date(appointment.startsAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>Agendado: {appointment.status}</span>
                        <span>
                          {new Date(appointment.endsAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  {day.slots.map((slot) => (
                    <div
                      className={`data-row calendar-slot calendar-slot--${slot.state.toLowerCase()}`}
                      key={slot.startsAt}
                    >
                      <span>
                        {new Date(slot.startsAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>
                        {slot.state === 'AVAILABLE'
                          ? 'Disponível'
                          : slot.state === 'BLOCKED'
                            ? 'Bloqueado'
                            : 'Indisponível'}
                      </span>
                      <span>{slot.reason ?? ''}</span>
                    </div>
                  ))}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
