import {
  CreateCustomerRequestSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
  TenantCustomFieldsResponseSchema,
} from '@plataforma/shared';
import { IconDots, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  formatMoneyCents,
  formatPhone,
  formatShortDate,
  initials,
  phoneLink,
  SEGMENT_CHIPS,
  SEGMENT_LABELS,
  SEGMENT_TONE,
  whatsappLink,
  whatsappNumber,
  type CustomerListItem,
  type CustomerSegment,
} from './customer-crm.js';
import { CustomerForm } from './CustomerForm.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { EmptyState, ListSkeleton, PageHeader, Pagination } from '../ui/AppUi.js';

export function CustomerModule({
  tenantPublicId,
  terminology,
  canCreate = false,
  canReadPayments = false,
  canCreateAppointments = false,
}: {
  tenantPublicId: string;
  terminology: string;
  canCreate?: boolean;
  canReadPayments?: boolean;
  canCreateAppointments?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [segment, setSegment] = useState<'' | CustomerSegment>('');
  const [professional, setProfessional] = useState('');
  const [service, setService] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const reset = () => {
    setPage(1);
  };

  const customers = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'customers',
      page,
      search,
      active,
      segment,
      professional,
      service,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim() !== '') query.set('search', search.trim());
      if (active !== '') query.set('active', active);
      if (segment !== '') query.set('segment', segment);
      if (professional !== '') query.set('professionalPublicId', professional);
      if (service !== '') query.set('servicePublicId', service);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/customers?${query.toString()}`, {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'customers'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: moreFilters,
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'customers'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    enabled: moreFilters,
    retry: false,
  });

  const fields = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-fields'],
    queryFn: () =>
      httpClient.request('/tenant/customer-fields', {
        schema: TenantCustomFieldsResponseSchema,
        tenantPublicId,
      }),
    enabled: creating,
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

  const metrics = customers.data?.metrics;

  const openCustomer = (publicId: string) => {
    void navigate(`/app/clientes/${publicId}`);
  };

  const segmentBadges = (customer: CustomerListItem) =>
    customer.segments.map((value) => (
      <span className={`ds-badge ds-badge--${SEGMENT_TONE[value]}`} key={value}>
        {SEGMENT_LABELS[value]}
      </span>
    ));

  const actionsMenu = (customer: CustomerListItem) => {
    const whatsapp = whatsappNumber(customer);
    return (
      <div className="crm-menu">
        <button
          className="secondary-button button--sm"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === customer.publicId}
          aria-label="Mais ações"
          onClick={(event) => {
            event.stopPropagation();
            setOpenMenu(openMenu === customer.publicId ? null : customer.publicId);
          }}
        >
          <IconDots size={16} aria-hidden="true" />
        </button>
        {openMenu === customer.publicId && (
          <ul className="crm-menu-list" role="menu">
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  openCustomer(customer.publicId);
                }}
              >
                Abrir ficha
              </button>
            </li>
            {canCreateAppointments && (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    void navigate(
                      `/app/agenda/agendamentos?customerPublicId=${customer.publicId}&returnTo=/app/clientes/${customer.publicId}`,
                    );
                  }}
                >
                  Novo agendamento
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  void navigate(
                    `/app/agenda/agendamentos?customerPublicId=${customer.publicId}`,
                  );
                }}
              >
                Ver agendamentos
              </button>
            </li>
            {whatsapp !== null && (
              <li>
                <a
                  role="menuitem"
                  href={whatsappLink(whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setOpenMenu(null);
                  }}
                >
                  Abrir conversa no WhatsApp
                </a>
              </li>
            )}
            {customer.phone !== null && (
              <li>
                <a
                  role="menuitem"
                  href={phoneLink(customer.phone)}
                  onClick={() => {
                    setOpenMenu(null);
                  }}
                >
                  Ligar
                </a>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="ds-stack crm-list-page" aria-label={`${terminology}s`}>
      <PageHeader
        eyebrow="Relacionamento"
        title={`${terminology}s`}
        description="Conheça seus clientes, acompanhe o relacionamento e identifique oportunidades de retorno."
        actions={
          canCreate ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setCreating(true);
              }}
            >
              <IconPlus size={16} aria-hidden="true" /> Adicionar {terminology.toLowerCase()}
            </button>
          ) : undefined
        }
      />

      {metrics !== undefined && (
        <div className="ds-stat-grid">
          <div className="ds-stat-card">
            <small>Clientes ativos</small>
            <strong>{metrics.active}</strong>
          </div>
          <div className="ds-stat-card">
            <small>Com agendamento</small>
            <strong>{metrics.scheduled}</strong>
          </div>
          <div className="ds-stat-card ds-stat-card--success">
            <small>Novos (30 dias)</small>
            <strong>{metrics.new}</strong>
          </div>
          <div className="ds-stat-card ds-stat-card--warning">
            <small>Sem retorno</small>
            <strong>{metrics.noReturn}</strong>
          </div>
          <div className="ds-stat-card">
            <small>Recorrentes</small>
            <strong>{metrics.recurring}</strong>
          </div>
        </div>
      )}

      {creating && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog crm-dialog" role="dialog" aria-modal="true" aria-label="Novo cliente">
            <div className="ds-section-card-header">
              <h3>Novo {terminology.toLowerCase()}</h3>
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  setCreating(false);
                }}
              >
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
        </div>
      )}

      <div className="app-filter-bar crm-filters">
        <label className="crm-filter-search">
          Buscar
          <span className="crm-search-field">
            <IconSearch size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Nome, telefone ou e-mail"
              onChange={(event) => {
                reset();
                setSearch(event.target.value);
              }}
            />
          </span>
        </label>
        <label>
          Status
          <select
            value={active}
            onChange={(event) => {
              reset();
              setActive(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
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
              Serviço
              <select
                value={service}
                onChange={(event) => {
                  reset();
                  setService(event.target.value);
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

      <div className="crm-chips" role="group" aria-label="Segmentos">
        {SEGMENT_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={segment === chip.value ? 'is-active' : ''}
            aria-pressed={segment === chip.value}
            onClick={() => {
              reset();
              setSegment(chip.value);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {customers.isPending ? (
        <ListSkeleton rows={6} />
      ) : customers.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar os clientes."
          description="Verifique sua conexão e tente novamente."
          action={
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void customers.refetch();
              }}
            >
              Tentar novamente
            </button>
          }
        />
      ) : customers.data === undefined || customers.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado com estes filtros."
          description="Ajuste a busca ou os segmentos para encontrar quem você procura."
        />
      ) : (
        <>
          <div className="ds-table-scroll crm-table-wrap">
            <table className="platform-table ds-data-table crm-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Última visita</th>
                  <th>Próximo agendamento</th>
                  <th>Atendimentos</th>
                  {canReadPayments && <th>Ticket médio</th>}
                  <th>Relacionamento</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {customers.data.items.map((customer) => (
                  <tr key={customer.publicId}>
                    <td>
                      <div className="crm-identity">
                        <span className="crm-avatar" aria-hidden="true">
                          {initials(customer.socialName ?? customer.name)}
                        </span>
                        <span>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => {
                              openCustomer(customer.publicId);
                            }}
                          >
                            {customer.socialName ?? customer.name}
                          </button>
                          <small>
                            {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="crm-contact">
                        <span>{customer.phone === null ? '—' : formatPhone(customer.phone)}</span>
                        {customer.email !== null && <small>{customer.email}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="crm-visit">
                        <span>{formatShortDate(customer.lastCompletedAt) ?? 'Nunca'}</span>
                        {customer.lastServiceName !== null && (
                          <small>
                            {customer.lastServiceName}
                            {customer.lastProfessionalName === null
                              ? ''
                              : ` · ${customer.lastProfessionalName}`}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="crm-visit">
                        <span>
                          {customer.nextAppointmentAt === null
                            ? 'Sem agendamento'
                            : new Date(customer.nextAppointmentAt).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                        </span>
                        {customer.nextServiceName !== null && (
                          <small>{customer.nextServiceName}</small>
                        )}
                      </div>
                    </td>
                    <td>{customer.appointmentCount}</td>
                    {canReadPayments && (
                      <td>
                        <div className="crm-visit">
                          <span>
                            {customer.averageTicketCents === null
                              ? '—'
                              : formatMoneyCents(customer.averageTicketCents)}
                          </span>
                          {customer.paidTotalCents !== null && (
                            <small>{formatMoneyCents(customer.paidTotalCents)} no total</small>
                          )}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="crm-badges">{segmentBadges(customer)}</div>
                    </td>
                    <td>
                      <div className="ds-row-actions crm-row-actions">
                        <button
                          className="secondary-button button--sm"
                          type="button"
                          onClick={() => {
                            openCustomer(customer.publicId);
                          }}
                        >
                          Ver cliente
                        </button>
                        {actionsMenu(customer)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="crm-cards">
            {customers.data.items.map((customer) => (
              <li className="crm-card" key={customer.publicId}>
                <div className="crm-identity">
                  <span className="crm-avatar" aria-hidden="true">
                    {initials(customer.socialName ?? customer.name)}
                  </span>
                  <span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        openCustomer(customer.publicId);
                      }}
                    >
                      {customer.socialName ?? customer.name}
                    </button>
                    {customer.phone !== null && <small>{formatPhone(customer.phone)}</small>}
                  </span>
                </div>
                <div className="crm-badges">{segmentBadges(customer)}</div>
                <dl className="crm-card-facts">
                  <div>
                    <dt>Última visita</dt>
                    <dd>
                      {formatShortDate(customer.lastCompletedAt) ?? 'Nunca'}
                      {customer.lastServiceName === null ? '' : ` · ${customer.lastServiceName}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Próximo</dt>
                    <dd>
                      {customer.nextAppointmentAt === null
                        ? 'Sem agendamento'
                        : new Date(customer.nextAppointmentAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    </dd>
                  </div>
                  <div>
                    <dt>Atendimentos</dt>
                    <dd>{customer.appointmentCount}</dd>
                  </div>
                  {canReadPayments && customer.averageTicketCents !== null && (
                    <div>
                      <dt>Ticket médio</dt>
                      <dd>{formatMoneyCents(customer.averageTicketCents)}</dd>
                    </div>
                  )}
                </dl>
                <div className="ds-row-actions crm-row-actions">
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      openCustomer(customer.publicId);
                    }}
                  >
                    Ver cliente
                  </button>
                  {actionsMenu(customer)}
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={customers.data.page.page}
            totalPages={customers.data.page.totalPages}
            onPrevious={() => {
              setPage((value) => value - 1);
            }}
            onNext={() => {
              setPage((value) => value + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
