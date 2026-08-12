import {
  CreateCustomerRequestSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  TenantCustomFieldsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CustomerForm } from './CustomerForm.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  PageToolbar,
  Pagination,
  StatusBadge,
} from '../ui/AppUi.js';

const shortDate = (value: string | null) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));

export function CustomerModule({
  tenantPublicId,
  terminology,
}: {
  tenantPublicId: string;
  terminology: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [creating, setCreating] = useState(false);
  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customers', page, search, active, unitPublicId],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim() !== '') query.set('search', search.trim());
      if (active !== '') query.set('active', active);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/customers?${query.toString()}`, {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const fields = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-fields'],
    queryFn: () =>
      httpClient.request('/tenant/customer-fields', {
        schema: TenantCustomFieldsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const create = useMutation({
    mutationFn: (body: unknown) =>
      httpClient.request('/tenant/customers', {
        method: 'POST',
        body: CreateCustomerRequestSchema.parse(body),
        schema: CustomerPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'customers'] });
      void navigate(`/app/clientes/${customer.publicId}`);
    },
  });
  return (
    <section
      aria-labelledby="customers-title"
      className="sessions-panel customer-module crm-list-page"
    >
      <PageHeader
        eyebrow="Relacionamento"
        title={`${terminology}s`}
        description="Consulte o relacionamento e aja sem perder o contexto do atendimento."
        actions={
          <button className="primary-button" type="button" onClick={() => { setCreating(true); }}>
            Adicionar {terminology.toLowerCase()}
          </button>
        }
      />
      {creating && (
        <div className="app-drawer" role="dialog" aria-label={`Novo ${terminology.toLowerCase()}`}>
          <div className="drawer-header">
            <h3>Novo {terminology.toLowerCase()}</h3>
            <button className="secondary-button" type="button" onClick={() => { setCreating(false); }}>
              Fechar
            </button>
          </div>
          <CustomerForm
            busy={create.isPending}
            error={create.error instanceof Error ? 'Não foi possível salvar o cliente.' : null}
            fields={fields.data?.fields.filter((field) => field.scope === 'CUSTOMER') ?? []}
            terminology={terminology}
            onSave={(value) => create.mutateAsync(value).then(() => undefined)}
          />
        </div>
      )}
      <PageToolbar>
        <label className="ds-field--wide">
          Busca
          <input
            value={search}
            placeholder="Buscar por nome, telefone ou e-mail"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={active}
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
        <label>
          Unidade
          <UnitSelect
            tenantPublicId={tenantPublicId}
            value={unitPublicId}
            onChange={(value) => {
              setPage(1);
              setUnitPublicId(value);
            }}
          />
        </label>
      </PageToolbar>
      {customers.isPending ? (
        <ListSkeleton rows={6} />
      ) : customers.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar os clientes."
          description="Verifique sua conexão e tente novamente."
          action={<button onClick={() => void customers.refetch()}>Tentar novamente</button>}
        />
      ) : customers.data === undefined || customers.data.items.length === 0 ? (
        <EmptyState
          title="Seus clientes aparecerão aqui."
          description="Você também pode cadastrar um cliente manualmente."
          action={<button onClick={() => { setCreating(true); }}>Adicionar cliente</button>}
        />
      ) : (
        <>
          <div className="crm-customer-table" role="table" aria-label="Clientes">
            <div className="crm-customer-table__head" role="row">
              <span>Nome</span>
              <span>Contato</span>
              <span>Último atendimento</span>
              <span>Próximo agendamento</span>
              <span>Atendimentos</span>
              <span>Status</span>
              <span>Ações</span>
            </div>
            {customers.data.items.map((customer) => (
              <button
                className="crm-customer-row"
                key={customer.publicId}
                role="row"
                type="button"
                onClick={() => void navigate(`/app/clientes/${customer.publicId}`)}
              >
                <span className="crm-customer-row__identity">
                  <b aria-hidden="true">{customer.name.slice(0, 2).toUpperCase()}</b>
                  <strong>{customer.socialName ?? customer.name}</strong>
                </span>
                <span>{customer.phone ?? customer.email ?? 'Sem contato'}</span>
                <span data-label="Último atendimento">{shortDate(customer.lastCompletedAt)}</span>
                <span data-label="Próximo">{shortDate(customer.nextAppointmentAt)}</span>
                <span data-label="Atendimentos">{customer.appointmentCount}</span>
                <StatusBadge active={customer.status === 'ACTIVE'}>
                  {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </StatusBadge>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <Pagination
            page={customers.data.page.page}
            totalPages={customers.data.page.totalPages}
            onPrevious={() => { setPage((value) => value - 1); }}
            onNext={() => { setPage((value) => value + 1); }}
          />
        </>
      )}
    </section>
  );
}
