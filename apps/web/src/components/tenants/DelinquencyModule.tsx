import { DelinquencyResponseSchema, ProfessionalListResponseSchema } from '@plataforma/shared';
import { IconDots, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  formatDateTime,
  formatMoneyCents,
  initials,
  RECEIVABLE_CHIPS,
  RECEIVABLE_LABELS,
  RECEIVABLE_TONE,
  type Receivable,
  type ReceivableState,
} from './financial-operations.js';
import { UnitSelect } from './UnitSelect.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, Pagination } from '../ui/AppUi.js';

const PAGE_SIZE = 20;

export function DelinquencyModule({
  tenantPublicId,
  canManagePayments = false,
  canReadCustomers = false,
}: {
  tenantPublicId: string;
  canManagePayments?: boolean;
  canReadCustomers?: boolean;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'' | ReceivableState>('');
  const [professional, setProfessional] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [detail, setDetail] = useState<Receivable | null>(null);

  const reset = () => {
    setPage(1);
  };

  const receivables = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'delinquency',
      page,
      search,
      state,
      professional,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim() !== '') query.set('search', search.trim());
      if (state !== '') query.set('state', state);
      if (professional !== '') query.set('professionalPublicId', professional);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/delinquency?${query.toString()}`, {
        schema: DelinquencyResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'delinquency'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: moreFilters,
    retry: false,
  });

  const summary = receivables.data?.summary;
  const items = receivables.data?.items ?? [];

  const openAppointment = (publicId: string) => {
    void navigate(`/app/agenda/agendamentos?appointmentPublicId=${publicId}`);
  };

  const actions = (item: Receivable) => (
    <div className="receivable-menu">
      <button
        className="secondary-button button--sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={openMenu === item.appointmentPublicId}
        aria-label="Mais ações"
        onClick={() => {
          setOpenMenu(openMenu === item.appointmentPublicId ? null : item.appointmentPublicId);
        }}
      >
        <IconDots size={16} aria-hidden="true" />
      </button>
      {openMenu === item.appointmentPublicId && (
        <ul className="receivable-menu-list" role="menu">
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMenu(null);
                setDetail(item);
              }}
            >
              Ver detalhes
            </button>
          </li>
          {canManagePayments && item.state !== 'ONLINE_PENDING' && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  openAppointment(item.appointmentPublicId);
                }}
              >
                Registrar recebimento
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMenu(null);
                openAppointment(item.appointmentPublicId);
              }}
            >
              Abrir agendamento
            </button>
          </li>
          {canReadCustomers && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  void navigate(`/app/clientes/${item.customerPublicId}`);
                }}
              >
                Abrir cliente
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );

  return (
    <div className="ds-stack receivables-page" aria-label="Pendências financeiras">
      <PageHeader
        eyebrow="Financeiro"
        title="Pendências financeiras"
        description="Acompanhe valores ainda não recebidos dos atendimentos."
      />

      {summary !== undefined && (
        <div className="ds-stat-grid">
          <div className="ds-stat-card ds-stat-card--warning">
            <small>A receber</small>
            <strong>{formatMoneyCents(summary.totalBalanceCents)}</strong>
            <small>{summary.count} atendimento(s) com saldo</small>
          </div>
          <div className="ds-stat-card">
            <small>Online aguardando</small>
            <strong>{formatMoneyCents(summary.onlinePendingCents)}</strong>
          </div>
          <div className="ds-stat-card ds-stat-card--danger">
            <small>Falha / expirada</small>
            <strong>{formatMoneyCents(summary.onlineFailedCents)}</strong>
          </div>
          <div className="ds-stat-card">
            <small>Pagamento no local</small>
            <strong>{formatMoneyCents(summary.onSiteCents)}</strong>
          </div>
        </div>
      )}

      <div className="app-filter-bar receivables-filters">
        <label className="receivables-filter-search">
          Buscar
          <span className="receivables-search-field">
            <IconSearch size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Cliente ou protocolo"
              onChange={(event) => {
                reset();
                setSearch(event.target.value);
              }}
            />
          </span>
        </label>
        {moreFilters && (
          <>
            <label>
              Profissional
              <select
                value={professional}
                onChange={(event) => {
                  reset();
                  setProfessional(event.target.value);
                }}
              >
                <option value="">Todos</option>
                {professionals.data?.items.map((item) => (
                  <option value={item.publicId} key={item.publicId}>
                    {item.publicName}
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
                  reset();
                  setUnitPublicId(value);
                }}
              />
            </label>
          </>
        )}
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setMoreFilters(!moreFilters);
          }}
        >
          {moreFilters ? 'Menos filtros' : 'Mais filtros'}
        </button>
      </div>

      <div className="receivables-chips" role="group" aria-label="Situação da cobrança">
        {RECEIVABLE_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={state === chip.value ? 'is-active' : ''}
            aria-pressed={state === chip.value}
            onClick={() => {
              reset();
              setState(chip.value);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {receivables.isPending ? (
        <ListSkeleton rows={5} />
      ) : receivables.error instanceof Error ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar as pendências.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void receivables.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma pendência encontrada."
          description="Todos os atendimentos deste filtro estão quitados."
        />
      ) : (
        <>
          <div className="ds-table-scroll receivables-table-wrap">
            <table className="platform-table ds-data-table receivables-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Agendamento</th>
                  <th>Data</th>
                  <th>Profissional</th>
                  <th>Valor líquido</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.appointmentPublicId}>
                    <td>
                      <div className="receivable-identity">
                        <span className="receivable-avatar" aria-hidden="true">
                          {initials(item.customerName)}
                        </span>
                        {canReadCustomers ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => {
                              void navigate(`/app/clientes/${item.customerPublicId}`);
                            }}
                          >
                            {item.customerName}
                          </button>
                        ) : (
                          <strong>{item.customerName}</strong>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          openAppointment(item.appointmentPublicId);
                        }}
                      >
                        {item.protocol}
                      </button>
                    </td>
                    <td>{formatDateTime(item.startsAt)}</td>
                    <td>{item.professionalName}</td>
                    <td>{formatMoneyCents(item.netPriceCents)}</td>
                    <td>{formatMoneyCents(item.paidCents)}</td>
                    <td>
                      <strong>{formatMoneyCents(item.balanceCents)}</strong>
                    </td>
                    <td>
                      <span className={`ds-badge ds-badge--${RECEIVABLE_TONE[item.state]}`}>
                        {RECEIVABLE_LABELS[item.state]}
                      </span>
                    </td>
                    <td>
                      <div className="ds-row-actions">
                        <button
                          className="secondary-button button--sm"
                          type="button"
                          onClick={() => {
                            setDetail(item);
                          }}
                        >
                          Detalhes
                        </button>
                        {actions(item)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="receivables-cards">
            {items.map((item) => (
              <li className="receivable-card" key={item.appointmentPublicId}>
                <div className="receivable-identity">
                  <span className="receivable-avatar" aria-hidden="true">
                    {initials(item.customerName)}
                  </span>
                  <span>
                    <strong>{item.customerName}</strong>
                    <small>
                      {item.protocol} · {formatDateTime(item.startsAt)}
                    </small>
                  </span>
                </div>
                <span className={`ds-badge ds-badge--${RECEIVABLE_TONE[item.state]}`}>
                  {RECEIVABLE_LABELS[item.state]}
                </span>
                <dl className="receivable-card-facts">
                  <div>
                    <dt>Líquido</dt>
                    <dd>{formatMoneyCents(item.netPriceCents)}</dd>
                  </div>
                  <div>
                    <dt>Pago</dt>
                    <dd>{formatMoneyCents(item.paidCents)}</dd>
                  </div>
                  <div>
                    <dt>Saldo</dt>
                    <dd>{formatMoneyCents(item.balanceCents)}</dd>
                  </div>
                </dl>
                <div className="ds-row-actions">
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      setDetail(item);
                    }}
                  >
                    Detalhes
                  </button>
                  {actions(item)}
                </div>
              </li>
            ))}
          </ul>

          {receivables.data?.page !== undefined && (
            <Pagination
              page={receivables.data.page.page}
              totalPages={receivables.data.page.totalPages}
              onPrevious={() => {
                setPage((value) => value - 1);
              }}
              onNext={() => {
                setPage((value) => value + 1);
              }}
            />
          )}
        </>
      )}

      {detail !== null && (
        <div
          className="appointments-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setDetail(null);
          }}
        >
          <aside
            className="appointments-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da pendência"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <header className="appointments-drawer-header">
              <div>
                <p className="ds-eyebrow">Pendência</p>
                <h3>{detail.protocol}</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  setDetail(null);
                }}
              >
                ×
              </button>
            </header>
            <div className="appointments-drawer-body">
              <div className="appointments-drawer-badges">
                <span className={`ds-badge ds-badge--${RECEIVABLE_TONE[detail.state]}`}>
                  {RECEIVABLE_LABELS[detail.state]}
                </span>
              </div>
              <dl className="appointments-drawer-facts">
                <div>
                  <dt>Cliente</dt>
                  <dd>{detail.customerName}</dd>
                </div>
                <div>
                  <dt>Serviço</dt>
                  <dd>{detail.serviceName}</dd>
                </div>
                <div>
                  <dt>Profissional</dt>
                  <dd>{detail.professionalName}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{formatDateTime(detail.startsAt)}</dd>
                </div>
                <div>
                  <dt>Valor bruto</dt>
                  <dd>{formatMoneyCents(detail.priceCents)}</dd>
                </div>
                <div>
                  <dt>Descontos</dt>
                  <dd>{formatMoneyCents(detail.discountCents)}</dd>
                </div>
                <div>
                  <dt>Valor líquido</dt>
                  <dd>{formatMoneyCents(detail.netPriceCents)}</dd>
                </div>
                <div>
                  <dt>Pago</dt>
                  <dd>{formatMoneyCents(detail.paidCents)}</dd>
                </div>
                <div>
                  <dt>Saldo</dt>
                  <dd>{formatMoneyCents(detail.balanceCents)}</dd>
                </div>
                <div>
                  <dt>Unidade</dt>
                  <dd>{detail.unitName ?? 'Não informada'}</dd>
                </div>
              </dl>
            </div>
            <footer className="appointments-drawer-footer">
              <div className="ds-form-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    openAppointment(detail.appointmentPublicId);
                  }}
                >
                  Abrir agendamento
                </button>
                {canReadCustomers && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      void navigate(`/app/clientes/${detail.customerPublicId}`);
                    }}
                  >
                    Abrir cliente
                  </button>
                )}
              </div>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
