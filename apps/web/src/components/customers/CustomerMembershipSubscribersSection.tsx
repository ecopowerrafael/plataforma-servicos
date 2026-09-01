import {
  CustomerMembershipSubscriberListResponseSchema,
  CustomerMembershipStatusSchema,
  type CustomerMembershipPlanPublic,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';

interface Props {
  tenantPublicId: string;
  plans: { data?: { items: CustomerMembershipPlanPublic[] } };
}

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const debounce = (fn: () => void, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(fn, delay);
  };
};

const statusOptions = [
  { value: 'PENDING', label: 'Pendente', color: 'orange' },
  { value: 'ACTIVE', label: 'Ativo', color: 'green' },
  { value: 'PAST_DUE', label: 'Inadimplente', color: 'red' },
  { value: 'PAUSED', label: 'Pausado', color: 'blue' },
  { value: 'CANCELED', label: 'Cancelado', color: 'gray' },
] as const;

const getStatusBadgeColor = (status: string): 'green' | 'orange' | 'red' | 'blue' | 'gray' => {
  const found = statusOptions.find((opt) => opt.value === status);
  return (found?.color ?? 'gray') as 'green' | 'orange' | 'red' | 'blue' | 'gray';
};

const getStatusLabel = (status: string) =>
  statusOptions.find((opt) => opt.value === status)?.label ?? status;

export function CustomerMembershipSubscribersSection({ tenantPublicId, plans }: Props) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const limit = 20;

  // Debounce search input
  const debouncedSearch = useMemo(
    () =>
      debounce(() => {
        setSearchQuery(searchInput);
        setPage(1);
      }, 350),
    [searchInput],
  );

  useEffect(() => {
    debouncedSearch();
  }, [searchInput, debouncedSearch]);

  const subscribers = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'customer-memberships',
      { page, searchQuery, statusFilter, planFilter },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      if (planFilter) params.set('planPublicId', planFilter);
      return httpClient.request(`/tenant/customer-memberships?${params}`, {
        tenantPublicId,
        schema: CustomerMembershipSubscriberListResponseSchema,
      });
    },
    retry: false,
  });

  const pagination = subscribers.data?.pagination;

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('');
    setPlanFilter('');
    setPage(1);
  };

  return (
    <section className="sessions-panel membership-plans-module">
      <PageHeader
        eyebrow="Assinaturas"
        title="Assinantes"
        description="Gerencie clientes com planos ativos e acompanhe seus ciclos de cobrança."
      />

      {/* Filters */}
      <div className="membership-filters">
        <div className="membership-search">
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="membership-search-input"
          />
        </div>

        <select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
          className="membership-filter-select"
        >
          <option value="">Todos os planos</option>
          {plans.data?.items.map((plan) => (
            <option key={plan.publicId} value={plan.publicId}>
              {plan.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="membership-filter-select"
        >
          <option value="">Todos os status</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {(searchInput || statusFilter || planFilter) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="membership-clear-btn"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      {subscribers.isLoading && <ListSkeleton count={5} />}

      {subscribers.error && (
        <EmptyState
          title="Erro ao carregar assinantes"
          description="Não foi possível carregar a lista de assinantes. Tente novamente."
          action={
            <button
              type="button"
              onClick={() => subscribers.refetch()}
              style={{
                padding: '0.55rem 1.2rem',
                border: '1px solid var(--ds-border-subtle)',
                borderRadius: '10px',
                background: 'var(--ds-background-primary)',
                color: 'var(--ds-text-primary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Tentar novamente
            </button>
          }
        />
      )}

      {!subscribers.isLoading && subscribers.data && subscribers.data.items.length === 0 && (
        <EmptyState
          title="Nenhum assinante encontrado"
          description="Comece criando o primeiro plano e então atribua-o aos seus clientes."
        />
      )}

      {!subscribers.isLoading && subscribers.data && subscribers.data.items.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className="membership-table-container">
            <table className="membership-subscribers-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Período atual</th>
                  <th>Valor mensal</th>
                  <th>Próxima cobrança</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.data.items.map((subscriber) => (
                  <tr key={subscriber.membershipPublicId}>
                    <td className="membership-subscriber-cell">
                      <div className="membership-customer-info">
                        <div className="membership-customer-avatar">
                          {subscriber.customerAvatar ? (
                            <img src={subscriber.customerAvatar} alt={subscriber.customerName} />
                          ) : (
                            <span>{subscriber.customerName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="membership-customer-name">{subscriber.customerName}</div>
                          <div className="membership-customer-email">{subscriber.customerEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td>{subscriber.planName}</td>
                    <td>
                      <StatusBadge
                        status={getStatusLabel(subscriber.status).toLowerCase()}
                        tone={getStatusBadgeColor(subscriber.status)}
                      />
                    </td>
                    <td className="membership-date-cell">
                      {subscriber.currentPeriodStart
                        ? new Date(subscriber.currentPeriodStart).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td>{money(subscriber.priceCents)}</td>
                    <td className="membership-date-cell">
                      {subscriber.nextBillingAt
                        ? new Date(subscriber.nextBillingAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="membership-mobile-cards">
            {subscribers.data.items.map((subscriber) => (
              <article
                key={subscriber.membershipPublicId}
                className="membership-subscriber-card"
              >
                <header className="membership-card-header">
                  <div className="membership-customer-info">
                    <div className="membership-customer-avatar">
                      {subscriber.customerAvatar ? (
                        <img src={subscriber.customerAvatar} alt={subscriber.customerName} />
                      ) : (
                        <span>{subscriber.customerName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="membership-customer-name">{subscriber.customerName}</div>
                      <div className="membership-customer-email">{subscriber.customerEmail}</div>
                    </div>
                  </div>
                  <StatusBadge
                    status={getStatusLabel(subscriber.status).toLowerCase()}
                    tone={getStatusBadgeColor(subscriber.status)}
                  />
                </header>

                <div className="membership-card-body">
                  <div className="membership-card-row">
                    <span className="membership-card-label">Plano</span>
                    <span className="membership-card-value">{subscriber.planName}</span>
                  </div>

                  <div className="membership-card-row">
                    <span className="membership-card-label">Período</span>
                    <span className="membership-card-value">
                      {subscriber.currentPeriodStart
                        ? new Date(subscriber.currentPeriodStart).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                  </div>

                  <div className="membership-card-row">
                    <span className="membership-card-label">Valor mensal</span>
                    <span className="membership-card-value">{money(subscriber.priceCents)}</span>
                  </div>

                  <div className="membership-card-row">
                    <span className="membership-card-label">Próx. cobrança</span>
                    <span className="membership-card-value">
                      {subscriber.nextBillingAt
                        ? new Date(subscriber.nextBillingAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="membership-pagination">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="membership-pagination-btn"
              >
                ← Anterior
              </button>
              <span className="membership-pagination-info">
                Página {pagination.page} de {pagination.pages} ({pagination.total} total)
              </span>
              <button
                type="button"
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
                className="membership-pagination-btn"
              >
                Próximo →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
