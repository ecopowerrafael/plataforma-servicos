import {
  AppointmentPublicSchema,
  AppointmentWaitlistListResponseSchema,
  AppointmentWaitlistPublicSchema,
  CustomerListResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

export function AppointmentWaitlistModule({ tenantPublicId }: { tenantPublicId: string }) {
  const cache = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customerPublicId: '',
    professionalPublicId: '',
    servicePublicId: '',
    unitPublicId: '',
    preferredDateFrom: today,
    preferredDateTo: today,
    preferredTimeStart: '08:00',
    preferredTimeEnd: '18:00',
    expiresAt: `${today}T23:59`,
    notes: '',
  });
  const [filters, setFilters] = useState({
    status: '',
    customerPublicId: '',
    professionalPublicId: '',
    servicePublicId: '',
    unitPublicId: '',
  });
  const resources = {
    customers: useQuery({
      queryKey: ['waitlist-customers', tenantPublicId],
      queryFn: () =>
        httpClient.request('/tenant/customers?limit=100&active=true', {
          schema: CustomerListResponseSchema,
          tenantPublicId,
        }),
    }),
    professionals: useQuery({
      queryKey: ['waitlist-professionals', tenantPublicId],
      queryFn: () =>
        httpClient.request('/tenant/professionals?limit=100&active=true', {
          schema: ProfessionalListResponseSchema,
          tenantPublicId,
        }),
    }),
    services: useQuery({
      queryKey: ['waitlist-services', tenantPublicId],
      queryFn: () =>
        httpClient.request('/tenant/services?limit=100&active=true', {
          schema: ServiceListResponseSchema,
          tenantPublicId,
        }),
    }),
  };
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== ''),
  ).toString();
  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment-waitlist', filters],
    queryFn: () =>
      httpClient.request(`/tenant/appointment-waitlist?${query}`, {
        schema: AppointmentWaitlistListResponseSchema,
        tenantPublicId,
      }),
  });
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'appointment-waitlist'] });
  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/appointment-waitlist', {
        method: 'POST',
        tenantPublicId,
        schema: AppointmentWaitlistPublicSchema,
        body: {
          ...form,
          professionalPublicId: form.professionalPublicId || null,
          expiresAt: new Date(form.expiresAt).toISOString(),
          notes: form.notes || null,
        },
      }),
    onSuccess: refresh,
  });
  const convert = useMutation({
    mutationFn: (item: { publicId: string; opportunityPublicId: string }) =>
      httpClient.request(`/tenant/appointment-waitlist/${item.publicId}/convert`, {
        method: 'POST',
        tenantPublicId,
        schema: AppointmentPublicSchema,
        body: { opportunityPublicId: item.opportunityPublicId },
      }),
    onSuccess: refresh,
  });
  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const filter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  return (
    <section className="sessions-panel">
      <p className="eyebrow">Lista de espera</p>
      <h2>Fila de agendamento</h2>
      <div className="session-grid">
        <label>
          Cliente
          <select
            value={form.customerPublicId}
            onChange={(e) => {
              set('customerPublicId', e.target.value);
            }}
          >
            <option value="">Selecione</option>
            {resources.customers.data?.items.map((x) => (
              <option key={x.publicId} value={x.publicId}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select
            value={form.professionalPublicId}
            onChange={(e) => {
              set('professionalPublicId', e.target.value);
            }}
          >
            <option value="">Qualquer profissional</option>
            {resources.professionals.data?.items.map((x) => (
              <option key={x.publicId} value={x.publicId}>
                {x.publicName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Serviço
          <select
            value={form.servicePublicId}
            onChange={(e) => {
              set('servicePublicId', e.target.value);
            }}
          >
            <option value="">Selecione</option>
            {resources.services.data?.items.map((x) => (
              <option key={x.publicId} value={x.publicId}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <UnitSelect
            value={form.unitPublicId}
            onChange={(value) => {
              set('unitPublicId', value);
            }}
            tenantPublicId={tenantPublicId}
          />
        </label>
        <label>
          Data inicial
          <input
            type="date"
            value={form.preferredDateFrom}
            onChange={(e) => {
              set('preferredDateFrom', e.target.value);
            }}
          />
        </label>
        <label>
          Data final
          <input
            type="date"
            value={form.preferredDateTo}
            onChange={(e) => {
              set('preferredDateTo', e.target.value);
            }}
          />
        </label>
        <label>
          Horário inicial
          <input
            type="time"
            value={form.preferredTimeStart}
            onChange={(e) => {
              set('preferredTimeStart', e.target.value);
            }}
          />
        </label>
        <label>
          Horário final
          <input
            type="time"
            value={form.preferredTimeEnd}
            onChange={(e) => {
              set('preferredTimeEnd', e.target.value);
            }}
          />
        </label>
        <label>
          Expira em
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => {
              set('expiresAt', e.target.value);
            }}
          />
        </label>
        <label>
          Observações
          <textarea
            value={form.notes}
            onChange={(e) => {
              set('notes', e.target.value);
            }}
          />
        </label>
      </div>
      <button
        className="primary-button"
        onClick={() => {
          create.mutate();
        }}
        disabled={create.isPending}
      >
        Adicionar à fila
      </button>
      <div className="filter-row">
        <select
          value={filters.status}
          onChange={(e) => {
            filter('status', e.target.value);
          }}
        >
          <option value="">Todos</option>
          {['WAITING', 'MATCHED', 'CONVERTED', 'EXPIRED', 'CANCELED'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          value={filters.customerPublicId}
          onChange={(e) => {
            filter('customerPublicId', e.target.value);
          }}
        >
          <option value="">Todos os clientes</option>
          {resources.customers.data?.items.map((x) => (
            <option key={x.publicId} value={x.publicId}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          value={filters.professionalPublicId}
          onChange={(e) => {
            filter('professionalPublicId', e.target.value);
          }}
        >
          <option value="">Todos os profissionais</option>
          {resources.professionals.data?.items.map((x) => (
            <option key={x.publicId} value={x.publicId}>
              {x.publicName}
            </option>
          ))}
        </select>
        <select
          value={filters.servicePublicId}
          onChange={(e) => {
            filter('servicePublicId', e.target.value);
          }}
        >
          <option value="">Todos os serviços</option>
          {resources.services.data?.items.map((x) => (
            <option key={x.publicId} value={x.publicId}>
              {x.name}
            </option>
          ))}
        </select>
        <UnitSelect
          value={filters.unitPublicId}
          onChange={(value) => {
            filter('unitPublicId', value);
          }}
          tenantPublicId={tenantPublicId}
        />
      </div>
      <ul>
        {list.data?.items.map((item) => (
          <li key={item.publicId}>
            {item.customerName} · {item.serviceName} ·{' '}
            {item.professionalName ?? 'qualquer profissional'} · {item.status}
            {item.opportunityPublicId !== null && (
              <button
                className="secondary-button"
                onClick={() => {
                  convert.mutate({
                    publicId: item.publicId,
                    opportunityPublicId: item.opportunityPublicId ?? '',
                  });
                }}
              >
                Converter{' '}
                {item.opportunityStartsAt === null
                  ? ''
                  : new Date(item.opportunityStartsAt).toLocaleString('pt-BR')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
