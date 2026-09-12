import {
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  CalendarResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  AgendaSkeleton,
  AppointmentDrawer,
  CalendarDay,
  CalendarMonth,
  CalendarWeek,
  type AgendaView,
} from './AgendaViews.js';
import { httpClient } from '../../lib/http.js';
import { TenantProfessionalPhoto } from '../professionals/TenantProfessionalPhoto.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

const localDate = (value: Date) =>
  `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const today = () => localDate(new Date());
const validDate = (value: string | null): value is string => {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
};
const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDate(value);
};
const addMonths = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + amount);
  return localDate(value);
};
const monthEnd = (date: string) => {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  value.setMonth(value.getMonth() + 1);
  value.setDate(0);
  return localDate(value);
};
const localDay = (value: string) => {
  const date = new Date(value);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const labelPeriod = (date: string, view: AgendaView) => {
  const value = new Date(`${date}T12:00:00`);
  if (view === 'month')
    return value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  if (view === 'week')
    return `${value.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${new Date(`${addDays(date, 6)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  return value.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

export function CalendarModule({ tenantPublicId }: { tenantPublicId: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (
    ['day', 'week', 'month'].includes(params.get('view') ?? '') ? params.get('view') : 'day'
  ) as AgendaView;
  const requestedDate = params.get('date');
  const date = validDate(requestedDate) ? requestedDate : today();
  const professionalPublicId = params.get('professional') ?? '';
  const [servicePublicId, setServicePublicId] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [professionalSearch, setProfessionalSearch] = useState('');
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const range = useMemo(
    () => ({
      from: view === 'month' ? `${date.slice(0, 7)}-01` : date,
      to: view === 'month' ? monthEnd(date) : view === 'week' ? addDays(date, 6) : date,
    }),
    [date, view],
  );
  const setRouteState = (next: { date?: string; view?: AgendaView; professional?: string }) => {
    const updated = new URLSearchParams(params);
    if (next.date !== undefined) updated.set('date', next.date);
    if (next.view !== undefined) updated.set('view', next.view);
    if (next.professional !== undefined) {
      if (next.professional === '') updated.delete('professional');
      else updated.set('professional', next.professional);
    }
    setParams(updated);
  };
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'agenda'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'agenda'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const appointments = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      'agenda',
      range,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({
        from: new Date(`${range.from}T00:00:00`).toISOString(),
        to: new Date(`${range.to}T23:59:59.999`).toISOString(),
      });
      if (professionalPublicId !== '') query.set('professionalPublicId', professionalPublicId);
      if (servicePublicId !== '') query.set('servicePublicId', servicePublicId);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/appointments?${query.toString()}`, {
        schema: AppointmentListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const availability = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'calendar',
      'agenda',
      range,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to,
        professionalPublicId,
        servicePublicId,
      });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/calendar?${query.toString()}`, {
        schema: CalendarResponseSchema,
        tenantPublicId,
      });
    },
    enabled: view !== 'month' && professionalPublicId !== '' && servicePublicId !== '',
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment', selectedAppointment],
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${selectedAppointment ?? ''}`, {
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    enabled: selectedAppointment !== null,
    retry: false,
  });
  const dates = Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(date, index));
  const slotsByDate = Object.fromEntries(
    (availability.data?.days ?? []).map((day) => [day.date, day.slots]),
  );
  const selectedName =
    professionalPublicId === ''
      ? 'Toda a equipe'
      : (professionals.data?.items.find((item) => item.publicId === professionalPublicId)
          ?.publicName ?? 'Profissional');
  const professionalItems = professionals.data?.items ?? [];
  const filteredProfessionals = professionalItems.filter((professional) =>
    professional.publicName
      .toLocaleLowerCase('pt-BR')
      .includes(professionalSearch.toLocaleLowerCase('pt-BR')),
  );
  const go = (direction: -1 | 1) => {
    setRouteState({
      date:
        view === 'month'
          ? addMonths(date, direction)
          : addDays(date, direction * (view === 'week' ? 7 : 1)),
    });
  };
  const openDay = (selectedDate: string) => {
    setRouteState({ date: selectedDate, view: 'day' });
  };
  const createAppointment = () => {
    void navigate('/app/agenda/agendamentos');
  };
  return (
    <section className="agenda-workspace" aria-labelledby="calendar-title">
      <header className="agenda-header">
        <div>
          <p className="eyebrow">Operação</p>
          <h2 id="calendar-title">Agenda</h2>
          <p>
            {selectedName} · {labelPeriod(date, view)}
          </p>
        </div>
        <button className="primary-button agenda-new" type="button" onClick={createAppointment}>
          + Novo agendamento
        </button>
      </header>
      <div className="agenda-toolbar">
        <div className="agenda-date-nav">
          <button
            className="icon-button"
            type="button"
            aria-label="Período anterior"
            onClick={() => {
              go(-1);
            }}
          >
            ‹
          </button>
          <button
            className="agenda-today"
            type="button"
            onClick={() => {
              setRouteState({ date: today() });
            }}
          >
            Hoje
          </button>
          <strong>{labelPeriod(date, view)}</strong>
          <button
            className="icon-button"
            type="button"
            aria-label="Próximo período"
            onClick={() => {
              go(1);
            }}
          >
            ›
          </button>
        </div>
        <div className="agenda-view-switch">
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              className={view === option ? 'active' : ''}
              type="button"
              key={option}
              onClick={() => {
                setRouteState({ view: option });
              }}
            >
              {option === 'day' ? 'Dia' : option === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
        <div className="agenda-compact-filters">
          <label>
            <span>Serviço</span>
            <select
              value={servicePublicId}
              onChange={(event) => {
                setServicePublicId(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {services.data?.items.map((item) => (
                <option value={item.publicId} key={item.publicId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Unidade</span>
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unitPublicId}
              onChange={setUnitPublicId}
            />
          </label>
        </div>
      </div>
      {professionalItems.length > 8 && (
        <label className="agenda-professional-search">
          <span>Buscar profissional</span>
          <input
            type="search"
            value={professionalSearch}
            placeholder="Nome do profissional"
            onChange={(event) => {
              setProfessionalSearch(event.target.value);
            }}
          />
        </label>
      )}
      <div className="agenda-professionals" aria-label="Filtrar por profissional">
        <button
          className={professionalPublicId === '' ? 'active' : ''}
          type="button"
          onClick={() => {
            setRouteState({ professional: '' });
          }}
        >
          <span className="agenda-avatar agenda-avatar--all">Todos</span>
          <strong>Equipe</strong>
        </button>
        {(professionalItems.length > 8 ? filteredProfessionals : professionalItems).map(
          (professional) => (
            <button
              className={professionalPublicId === professional.publicId ? 'active' : ''}
              type="button"
              key={professional.publicId}
              onClick={() => {
                setRouteState({ professional: professional.publicId });
              }}
            >
              <TenantProfessionalPhoto
                name={professional.publicName}
                professionalPublicId={professional.publicId}
                tenantPublicId={tenantPublicId}
              />
              <strong>{professional.publicName.split(' ')[0]}</strong>
              <i style={{ background: professional.calendarColor }} />
            </button>
          ),
        )}
      </div>
      {appointments.isPending ? (
        <AgendaSkeleton />
      ) : appointments.error instanceof Error ? (
        <div className="agenda-inline-error">
          <strong>Não foi possível carregar a agenda.</strong>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void appointments.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="agenda-surface">
          {professionalPublicId !== '' && servicePublicId === '' && view !== 'month' && (
            <div className="agenda-hint">
              Selecione um serviço para visualizar também horários livres, pausas e bloqueios.
            </div>
          )}
          {availability.error instanceof Error && (
            <div className="agenda-hint agenda-hint--error">
              A disponibilidade não pôde ser carregada. Os agendamentos continuam visíveis.
            </div>
          )}
          {view === 'day' && (
            <CalendarDay
              date={date}
              appointments={(appointments.data?.items ?? []).filter(
                (item) => localDay(item.startsAt) === date,
              )}
              slots={slotsByDate[date] ?? []}
              onOpen={setSelectedAppointment}
              onCreate={createAppointment}
            />
          )}
          {view === 'week' && (
            <CalendarWeek
              dates={dates}
              appointments={appointments.data?.items ?? []}
              slotsByDate={slotsByDate}
              onOpen={setSelectedAppointment}
              onSelectDay={openDay}
            />
          )}
          {view === 'month' && (
            <CalendarMonth
              date={date}
              appointments={appointments.data?.items ?? []}
              onSelectDay={openDay}
            />
          )}
        </div>
      )}
      {selectedAppointment !== null && (
        <AppointmentDrawer
          item={detail.data}
          loading={detail.isPending}
          error={detail.error instanceof Error}
          onClose={() => {
            setSelectedAppointment(null);
          }}
          footer={
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void navigate('/app/agenda/agendamentos');
              }}
            >
              Abrir ações do agendamento
            </button>
          }
        />
      )}
    </section>
  );
}
