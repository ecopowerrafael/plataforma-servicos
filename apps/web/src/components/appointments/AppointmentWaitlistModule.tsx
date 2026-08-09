import {
  AppointmentListResponseSchema,
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
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

const waitlistStatusLabels: Record<string, string> = {
  WAITING: 'Na fila',
  MATCHED: 'Oportunidade',
  CONVERTED: 'Convertida',
  EXPIRED: 'Expirada',
  CANCELED: 'Cancelada',
};

export function AppointmentWaitlistModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [customer, setCustomer] = useState('');
  const [professional, setProfessional] = useState('');
  const [service, setService] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customers', 'waitlist'],
    queryFn: () =>
      httpClient.request('/tenant/customers?limit=100&active=true', {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'waitlist'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'waitlist'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment-waitlist', statusFilter, customer, professional, service, unitPublicId],
    queryFn: () => {
      const query = new URLSearchParams();
      if (statusFilter !== '') query.set('status', statusFilter);
      if (customer !== '') query.set('customerPublicId', customer);
      return httpClient.request(`/tenant/appointment-waitlist?${query.toString()}`, {
        schema: AppointmentWaitlistListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment-waitlist', selected],
    queryFn: () => httpClient.request(`/tenant/appointment-waitlist/${selected ?? ''}`, {
      schema: AppointmentWaitlistPublicSchema,
      tenantPublicId,
    }),
    enabled: selected !== null,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({ url, method, body, schema }: { url: string; method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown; schema: any }) =>
      httpClient.request(url, { method, body, schema, tenantPublicId }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'appointment-waitlist'] });
      setFeedback('Operação concluída com sucesso.');
    },
  });

  const create = async () => {
    const payload = {
      customerPublicId: customer,
      professionalPublicId: professional,
      servicePublicId: service,
      ...(unitPublicId === '' ? {} : { unitPublicId }),
      preferredStartsAt: new Date(startsAt).toISOString(),
      ...(notes === '' ? {} : { notes }),
    };
    await mutation.mutateAsync({
      url: '/tenant/appointment-waitlist',
      method: 'POST',
      body: payload,
      schema: AppointmentWaitlistPublicSchema,
    });
  };

  const match = async () => {
    if (selected === null) return;
    await mutation.mutateAsync({
      url: `/tenant/appointment-waitlist/${selected}/match`,
      method: 'POST',
      body: { preferredStartsAt: new Date(startsAt).toISOString(), reason: 'Oportunidade disponível' },
      schema: AppointmentWaitlistPublicSchema,
    });
  };

  const convert = async () => {
    if (selected === null) return;
    await mutation.mutateAsync({
      url: `/tenant/appointment-waitlist/${selected}/convert`,
      method: 'POST',
      body: {
        customerPublicId: customer,
        professionalPublicId: professional,
        servicePublicId: service,
        ...(unitPublicId === '' ? {} : { unitPublicId }),
        startsAt: new Date(startsAt).toISOString(),
        notes: notes === '' ? null : notes,
      },
      schema: AppointmentPublicSchema,
    });
  };

  const cancel = () => {
    if (selected === null) return;
    setConfirmation({
      title: 'Cancelar entrada da fila?',
      description: 'Esta ação encerra a solicitação e remove a elegibilidade para conversão.',
      confirmLabel: 'Cancelar',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/tenant/appointment-waitlist/${selected}/cancel`,
          method: 'POST',
          body: { reason: 'Cancelado pela recepção' },
          schema: AppointmentWaitlistPublicSchema,
        });
      },
    });
  };

  return (
    <section className="sessions-panel">
      <p className="eyebrow">Lista de espera</p>
      <h2>Fila de agendamento</h2>
      {feedback && <p className="form-success">{feedback}</p>}
      <div className="session-grid">
        <label>
          Cliente
          <select value={customer} onChange={(event) => setCustomer(event.target.value)}>
            <option value="">Selecione</option>
            {customers.data?.items.map((item) => (
              <option key={item.publicId} value={item.publicId}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select value={professional} onChange={(event) => setProfessional(event.target.value)}>
            <option value="">Selecione</option>
            {professionals.data?.items.map((item) => (
              <option key={item.publicId} value={item.publicId}>{item.publicName}</option>
            ))}
          </select>
        </label>
        <label>
          Serviço
          <select value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">Selecione</option>
            {services.data?.items.map((item) => (
              <option key={item.publicId} value={item.publicId}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <UnitSelect value={unitPublicId} onChange={setUnitPublicId} tenantPublicId={tenantPublicId} />
        </label>
        <label>
          Preferência
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(new Date(event.target.value).toISOString())} />
        </label>
        <label>
          Observações
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
      </div>
      <div className="flex-row">
        <button className="primary-button" onClick={() => void create()}>Adicionar à fila</button>
        <button className="secondary-button" onClick={() => void match()} disabled={selected === null}>Marcar oportunidade</button>
        <button className="secondary-button" onClick={() => void convert()} disabled={selected === null}>Converter em agendamento</button>
        <button className="danger-button" onClick={cancel} disabled={selected === null}>Cancelar</button>
      </div>

      <div className="filter-row">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Todos os status</option>
          <option value="WAITING">Na fila</option>
          <option value="MATCHED">Oportunidade</option>
          <option value="CONVERTED">Convertida</option>
          <option value="CANCELED">Cancelada</option>
        </select>
      </div>

      <ul>
        {list.data?.items.map((item) => (
          <li key={item.publicId}>
            <button className="text-button" onClick={() => setSelected(item.publicId)}>
              {item.customerPublicId} · {waitlistStatusLabels[item.status] ?? item.status} · {new Date(item.createdAt).toLocaleString('pt-BR')}
            </button>
          </li>
        ))}
      </ul>

      {detail.data && (
        <div className="sessions-panel">
          <h3>Detalhes</h3>
          <p>Status: {waitlistStatusLabels[detail.data.status] ?? detail.data.status}</p>
          <p>Profissional: {detail.data.professionalPublicId}</p>
          <p>Serviço: {detail.data.servicePublicId}</p>
          {detail.data.notes && <p>Notas: {detail.data.notes}</p>}
          {detail.data.preferredStartsAt && (
            <p>Preferência: {new Date(detail.data.preferredStartsAt).toLocaleString('pt-BR')}</p>
          )}
        </div>
      )}

      <ConfirmationDialog
        open={confirmation !== null}
        title={confirmation?.title ?? ''}
        description={confirmation?.description ?? ''}
        confirmLabel={confirmation?.confirmLabel ?? 'Confirmar'}
        cancelLabel="Voltar"
        variant={confirmation?.variant ?? 'default'}
        requiresReason={confirmation?.requiresReason ?? false}
        reasonLabel={confirmation?.reasonLabel ?? 'Motivo'}
        onCancel={() => setConfirmation(null)}
        onConfirm={async (reason) => {
          if (confirmation?.onConfirm) await confirmation.onConfirm(reason);
          setConfirmation(null);
        }}
      />
    </section>
  );
}
