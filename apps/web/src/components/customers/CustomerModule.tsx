import {
  CreateCustomerRequestSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  CustomerStatusResponseSchema,
  TenantCustomFieldsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type ZodType } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { CustomerForm } from './CustomerForm.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { PageHeader, PageToolbar, StatusBadge } from '../ui/AppUi.js';

export function CustomerModule({
  tenantPublicId,
  terminology,
}: {
  tenantPublicId: string;
  terminology: string;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customers', page, search, active, unitPublicId],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim() !== '') query.set('search', search.trim());
      if (active !== '') query.set('active', active);
      if (unitPublicId.trim() !== '') query.set('unitPublicId', unitPublicId.trim());
      return httpClient.request(`/tenant/customers?${query.toString()}`, {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer', selected],
    queryFn: () =>
      httpClient.request(`/tenant/customers/${selected ?? ''}`, {
        schema: CustomerPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
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
  const mutation = useMutation({
    mutationFn: ({
      url,
      method,
      body,
      status,
    }: {
      url: string;
      method: 'POST' | 'PATCH';
      body?: unknown;
      status?: boolean;
    }) => {
      const schema: ZodType = status === true ? CustomerStatusResponseSchema : CustomerPublicSchema;
      return httpClient.request<unknown>(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      setNotice('Operação concluída com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'customers'] }),
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'customer', selected] }),
      ]);
    },
  });
  const save = async (value: unknown) => {
    const output = await mutation.mutateAsync({
      url: selected === null ? '/tenant/customers' : `/tenant/customers/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateCustomerRequestSchema.parse(value),
    });
    const customer = CustomerPublicSchema.parse(output);
    setSelected(customer.publicId);
    setCreating(false);
  };
  const requestStatus = (enabled: boolean) => {
    if (selected === null) return;
    setConfirmation({
      title: `${enabled ? 'Ativar' : 'Desativar'} ${terminology.toLowerCase()}?`,
      description: enabled
        ? 'O cadastro voltará a ficar disponível para novos atendimentos.'
        : 'O cadastro deixará de estar disponível para novos atendimentos.',
      confirmLabel: enabled ? 'Ativar' : 'Desativar',
      requiresReason: false,
      variant: enabled ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/tenant/customers/${selected}/${enabled ? 'activate' : 'deactivate'}`,
          method: 'POST',
          status: true,
        });
      },
    });
  };
  return (
    <section aria-labelledby="customers-title" className="sessions-panel customer-module">
      <PageHeader
        eyebrow="Relacionamento"
        title={`${terminology}s`}
        description="Centralize os cadastros e acompanhe a sua base."
        actions={
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setCreating((value) => !value);
            }}
          >
            {creating ? 'Fechar cadastro' : `Novo ${terminology.toLowerCase()}`}
          </button>
        }
      />
      {notice !== null && <p className="success-message">{notice}</p>}
      {creating && (
        <div className="app-drawer">
          <CustomerForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            fields={fields.data?.fields.filter((field) => field.scope === 'CUSTOMER') ?? []}
            terminology={terminology}
            onSave={save}
          />
        </div>
      )}
      <PageToolbar>
        <label>
          Busca
          <input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder={`Nome do ${terminology.toLowerCase()}`}
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
        <p>{`Carregando ${terminology.toLowerCase()}s…`}</p>
      ) : customers.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os cadastros.</p>
      ) : customers.data === undefined || customers.data.items.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhum cadastro encontrado</strong>
          <span>Ajuste os filtros ou crie o primeiro {terminology.toLowerCase()}.</span>
        </div>
      ) : (
        <>
          <div className="data-list">
            {customers.data.items.map((customer) => (
              <button
                className="data-row"
                key={customer.publicId}
                type="button"
                onClick={() => {
                  setSelected(customer.publicId);
                  setCreating(false);
                }}
              >
                <span>{customer.name}</span>
                <span>{customer.email ?? customer.phone ?? 'Sem contato'}</span>
                <StatusBadge active={customer.status === 'ACTIVE'}>
                  {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </StatusBadge>
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button
              disabled={page <= 1}
              type="button"
              onClick={() => {
                setPage((value) => value - 1);
              }}
            >
              Anterior
            </button>
            <span>{`Página ${String(customers.data.page.page)} de ${String(customers.data.page.totalPages)}`}</span>
            <button
              disabled={page >= customers.data.page.totalPages}
              type="button"
              onClick={() => {
                setPage((value) => value + 1);
              }}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.name}</h3>
          <dl className="platform-details">
            <div>
              <dt>Status</dt>
              <dd>{detail.data.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{detail.data.email ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{detail.data.phone ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt>Unidade</dt>
              <dd>{detail.data.primaryUnitPublicId ?? 'Não informada'}</dd>
            </div>
          </dl>
          <CustomerForm
            customer={detail.data}
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            fields={fields.data?.fields.filter((field) => field.scope === 'CUSTOMER') ?? []}
            terminology={terminology}
            onSave={save}
          />
          <div className="form-actions">
            <button
              disabled={mutation.isPending || detail.data.status === 'ACTIVE'}
              type="button"
              onClick={() => {
                requestStatus(true);
              }}
            >
              Ativar
            </button>
            <button
              disabled={mutation.isPending || detail.data.status !== 'ACTIVE'}
              type="button"
              onClick={() => {
                requestStatus(false);
              }}
            >
              Desativar
            </button>
          </div>
        </article>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
