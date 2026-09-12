import { PlanListResponseSchema, PlatformTenantListResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { ErrorState, formatCycle, formatDate, PageHeader, Pagination, StatusBadge } from './PlatformUi.js';
import { TenantDetailPage } from './TenantDetailPage.js';
import { TenantProvisionForm } from './TenantProvisionForm.js';
import { httpClient } from '../../lib/http.js';

import type { CreatePlatformTenantRequestSchema } from '@plataforma/shared';

export function TenantModule({
  tenantPublicId,
  onOpen,
}: {
  tenantPublicId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const client = useQueryClient();
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', page, search, status],
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(page),
        limit: '10',
        orderBy: 'createdAt',
        direction: 'desc',
      });
      if (search.trim() !== '') query.set('search', search.trim());
      if (status !== '') query.set('status', status);
      return httpClient.request(`/platform/tenants?${query.toString()}`, {
        schema: PlatformTenantListResponseSchema,
      });
    },
    retry: false,
    enabled: tenantPublicId === undefined,
  });
  const plans = useQuery({
    queryKey: ['platform', 'plans', 'provisioning'],
    queryFn: () =>
      httpClient.request('/platform/plans?status=ACTIVE&limit=100', {
        schema: PlanListResponseSchema,
      }),
    retry: false,
    enabled: tenantPublicId === undefined,
  });
  const provisionMutation = useMutation({
    mutationFn: (body: z.infer<typeof CreatePlatformTenantRequestSchema>) =>
      httpClient.request('/platform/tenants', { body, schema: z.looseObject({}) }),
    onSuccess: async () => {
      setCreating(false);
      await client.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });

  if (tenantPublicId) {
    return <TenantDetailPage tenantPublicId={tenantPublicId} />;
  }

  return (
    <section aria-labelledby="tenant-title">
      <PageHeader
        title="Estabelecimentos"
        description="Gerencie estabelecimentos, acessos e assinaturas da plataforma."
        action={
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            + Novo estabelecimento
          </button>
        }
      />
      {creating ? (
        <>
          <button
            className="platform-backdrop"
            aria-label="Fechar formulario"
            onClick={() => {
              setCreating(false);
            }}
            type="button"
          />
          <aside
            className="platform-drawer"
            aria-label="Novo estabelecimento"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="platform-drawer-close"
              aria-label="Fechar"
              onClick={() => {
                setCreating(false);
              }}
              type="button"
            >
              ×
            </button>
            <TenantProvisionForm
              busy={provisionMutation.isPending}
              error={provisionMutation.error instanceof Error ? provisionMutation.error.message : null}
              plans={plans.data?.items ?? []}
              onProvision={async (body) => {
                await provisionMutation.mutateAsync(body);
              }}
            />
          </aside>
        </>
      ) : null}
      <div className="platform-filter-bar">
        <label>
          Busca
          <input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Nome ou slug"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Ativo</option>
            <option value="SUSPENDED">Suspenso</option>
            <option value="INACTIVE">Inativo</option>
            <option value="PENDING">Pendente</option>
          </select>
        </label>
      </div>
      {tenants.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : tenants.error instanceof Error ? (
        <ErrorState
          message={tenants.error.message}
          retry={() => {
            void tenants.refetch();
          }}
        />
      ) : tenants.data === undefined || tenants.data.items.length === 0 ? (
        <div className="platform-empty">
          <h3>Nenhum estabelecimento encontrado</h3>
          <p>
            {search || status
              ? 'Nenhum estabelecimento corresponde aos filtros atuais.'
              : 'Cadastre o primeiro estabelecimento da plataforma.'}
          </p>
          <button
            onClick={() => {
              setCreating(true);
            }}
            type="button"
          >
            Novo estabelecimento
          </button>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th>Plano</th>
                  <th>Assinatura</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>
                    <span className="sr-only">Acoes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenants.data.items.map((tenant) => (
                  <tr
                    key={tenant.publicId}
                    onClick={() => {
                      onOpen(tenant.publicId);
                    }}
                  >
                    <td>
                      <strong>{tenant.displayName}</strong>
                      <span>{tenant.slug}</span>
                    </td>
                    <td>
                      <strong>{tenant.subscription?.plan.name ?? 'Sem plano'}</strong>
                      <span>
                        {tenant.subscription ? formatCycle(tenant.subscription.billingCycle) : ''}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={tenant.subscription?.status ?? 'INACTIVE'} />
                    </td>
                    <td>
                      <StatusBadge value={tenant.status} />
                    </td>
                    <td>{formatDate(tenant.createdAt)}</td>
                    <td>
                      <button
                        aria-label={`Ver detalhes de ${tenant.displayName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(tenant.publicId);
                        }}
                        type="button"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={tenants.data.page.totalPages}
            total={tenants.data.page.total}
            limit={tenants.data.page.limit}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
