import {
  CalendarResponseSchema,
  ProfessionalPublicSchema,
  ProfessionalScheduleResponseSchema,
  ProfessionalServicesResponseSchema,
  ProfessionalUnavailabilityListResponseSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';

const weekdayLabel = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const unavailabilityTypes = [
  'BLOCK',
  'DAY_OFF',
  'VACATION',
  'SICK_LEAVE',
  'PERSONAL',
  'OTHER',
] as const;

interface FormState {
  type: (typeof unavailabilityTypes)[number];
  title: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

const initialForm: FormState = {
  type: 'BLOCK',
  title: '',
  reason: '',
  startsAt: '',
  endsAt: '',
  allDay: false,
};

const today = () => new Date().toISOString().slice(0, 10);

export function MyAvailabilityModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [servicePublicId, setServicePublicId] = useState('');
  const [availabilityFrom, setAvailabilityFrom] = useState(today);
  const [availabilityTo, setAvailabilityTo] = useState(today);

  const me = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me', {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const schedule = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'schedule'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/schedule', {
        schema: ProfessionalScheduleResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });

  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'services'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/services', {
        schema: ProfessionalServicesResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });

  const availability = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'professionals',
      'me',
      'availability',
      availabilityFrom,
      availabilityTo,
      servicePublicId,
    ],
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/me/availability?from=${availabilityFrom}&to=${availabilityTo}&servicePublicId=${servicePublicId}`,
        { schema: CalendarResponseSchema, tenantPublicId },
      ),
    enabled: me.data !== undefined && servicePublicId !== '',
    retry: false,
  });

  const unavailabilitiesQueryKey = [
    'tenant',
    tenantPublicId,
    'professionals',
    'me',
    'unavailabilities',
  ];
  const unavailabilities = useQuery({
    queryKey: unavailabilitiesQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/unavailabilities', {
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });

  const invalidateUnavailabilities = () =>
    queryClient.invalidateQueries({ queryKey: unavailabilitiesQueryKey });

  const body = () => ({
    type: form.type,
    title: form.title,
    reason: form.reason === '' ? null : form.reason,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    allDay: form.allDay,
    repeatsWeekly: false,
    recurrenceEndsAt: null,
    unitPublicId: null,
    active: true,
  });

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/professionals/me/unavailabilities', {
        method: 'POST',
        body: UpdateProfessionalUnavailabilityRequestSchema.parse(body()),
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setForm(initialForm);
      await invalidateUnavailabilities();
    },
  });

  const update = useMutation({
    mutationFn: () => {
      if (editing === null) throw new Error('Nenhum bloqueio selecionado.');
      return httpClient.request(`/tenant/professionals/me/unavailabilities/${editing}`, {
        method: 'PATCH',
        body: UpdateProfessionalUnavailabilityRequestSchema.parse(body()),
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      setForm(initialForm);
      await invalidateUnavailabilities();
    },
  });

  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/professionals/me/unavailabilities/${publicId}`, {
        method: 'DELETE',
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    onSuccess: invalidateUnavailabilities,
  });

  if (me.error instanceof Error) return null;

  const busy = create.isPending || update.isPending || remove.isPending;
  const mutationError = create.error ?? update.error ?? remove.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="platform-form" aria-label="Minha disponibilidade">
      <h3>Minha jornada e disponibilidade</h3>
      {me.isPending ? <p>Carregando…</p> : null}
      {me.data !== undefined && (
        <>
          <div>
            <strong>Jornada semanal</strong>
            {schedule.isPending ? <p>Carregando jornada…</p> : null}
            {schedule.error instanceof Error ? (
              <p className="form-error">Não foi possível carregar a jornada.</p>
            ) : null}
            <ul>
              {schedule.data?.items.map((period) => (
                <li key={period.publicId}>
                  {`${weekdayLabel[period.weekday] ?? String(period.weekday)} ${period.startsAt}–${period.endsAt}`}
                  {!period.active && ' (inativo)'}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <strong>Disponibilidade</strong>
            <div className="form-actions">
              <label>
                De
                <input
                  type="date"
                  value={availabilityFrom}
                  onChange={(event) => {
                    setAvailabilityFrom(event.target.value);
                  }}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={availabilityTo}
                  onChange={(event) => {
                    setAvailabilityTo(event.target.value);
                  }}
                />
              </label>
              <label>
                Serviço
                <select
                  value={servicePublicId}
                  onChange={(event) => {
                    setServicePublicId(event.target.value);
                  }}
                >
                  <option value="">Selecione um serviço</option>
                  {services.data?.items.map((item) => (
                    <option key={item.servicePublicId} value={item.servicePublicId}>
                      {item.servicePublicId}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {availability.error instanceof Error ? (
              <p className="form-error">Não foi possível carregar a disponibilidade.</p>
            ) : null}
            <ul>
              {availability.data?.days.map((day) => (
                <li key={day.date}>
                  {`${day.date}: ${String(day.slots.filter((slot) => slot.state === 'AVAILABLE').length)} horário(s) disponível(is)`}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <strong>Bloqueios e folgas</strong>
            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(event) => {
                    change('type', event.target.value as FormState['type']);
                  }}
                >
                  {unavailabilityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Título
                <input
                  value={form.title}
                  onChange={(event) => {
                    change('title', event.target.value);
                  }}
                />
              </label>
              <label>
                Motivo
                <input
                  value={form.reason}
                  onChange={(event) => {
                    change('reason', event.target.value);
                  }}
                />
              </label>
              <label>
                Início
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => {
                    change('startsAt', event.target.value);
                  }}
                />
              </label>
              <label>
                Fim
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => {
                    change('endsAt', event.target.value);
                  }}
                />
              </label>
            </div>
            <label>
              <input
                checked={form.allDay}
                type="checkbox"
                onChange={(event) => {
                  change('allDay', event.target.checked);
                }}
              />
              Dia inteiro
            </label>
            <div className="form-actions">
              <button
                disabled={busy || form.title === '' || form.startsAt === '' || form.endsAt === ''}
                type="button"
                onClick={() => {
                  if (editing === null) create.mutate();
                  else update.mutate();
                }}
              >
                {busy ? 'Salvando…' : editing === null ? 'Criar bloqueio' : 'Salvar alterações'}
              </button>
              {editing !== null && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(initialForm);
                  }}
                >
                  Cancelar edição
                </button>
              )}
            </div>
            {errorMessage !== null && (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            )}
            {unavailabilities.isPending ? <p>Carregando bloqueios…</p> : null}
            {unavailabilities.error instanceof Error ? (
              <p className="form-error">Não foi possível carregar os bloqueios.</p>
            ) : null}
            <ul>
              {unavailabilities.data?.items.map((item) => (
                <li key={item.publicId}>
                  <span>{`${item.type}: ${item.title} — ${new Date(item.startsAt).toLocaleString('pt-BR')} até ${new Date(item.endsAt).toLocaleString('pt-BR')}`}</span>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      setEditing(item.publicId);
                      setForm({
                        type: item.type,
                        title: item.title,
                        reason: item.reason ?? '',
                        startsAt: item.startsAt.slice(0, 16),
                        endsAt: item.endsAt.slice(0, 16),
                        allDay: item.allDay,
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      remove.mutate(item.publicId);
                    }}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
