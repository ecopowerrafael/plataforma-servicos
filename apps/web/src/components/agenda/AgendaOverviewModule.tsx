import {
  AgendaOverviewResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
  type AppointmentPaymentState,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  addDays,
  addMonths,
  formatMoneyCents,
  formatPhone,
  initials,
  isValidDate,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONE,
  percentOf,
  periodLabel,
  periodRange,
  today,
  type AgendaPeriod,
} from './agenda-overview.js';
import { AgendaCompleteDialog, type AgendaCompleteTarget } from './AgendaCompleteDialog.js';
import {
  AgendaHourChart,
  AgendaProfessionalRanking,
  AgendaStatusDonut,
} from './AgendaOverviewCharts.js';
import { httpClient } from '../../lib/http.js';
import {
  AppointmentStatusBadge,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from '../appointments/appointment-status.js';
import { AppointmentDrawer } from '../calendar/AgendaViews.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

type Appointment = ReturnType<typeof AppointmentPublicSchema.parse>;

const PERIODS: { value: AgendaPeriod; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const hourLabel = (value: string) =>
  new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Transições oferecidas na linha, respeitando a máquina de estados do backend. */
const nextStatuses = (status: AppointmentStatus) =>
  status === 'PENDING'
    ? (['CONFIRMED', 'IN_PROGRESS'] as const)
    : status === 'CONFIRMED'
      ? (['IN_PROGRESS'] as const)
      : ([] as const);

export function AgendaOverviewModule({
  tenantPublicId,
  canCreate = false,
  canManageStatus = false,
  canCheckIn = false,
  canReadPayments = false,
  canManagePayments = false,
  canReadCustomers = false,
}: {
  tenantPublicId: string;
  canCreate?: boolean;
  canManageStatus?: boolean;
  canCheckIn?: boolean;
  canReadPayments?: boolean;
  canManagePayments?: boolean;
  canReadCustomers?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const period = (
    PERIODS.some((item) => item.value === params.get('period')) ? params.get('period') : 'day'
  ) as AgendaPeriod;
  const requestedDate = params.get('date');
  const date = isValidDate(requestedDate) ? requestedDate : today();
  const professionalPublicId = params.get('professional') ?? '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [servicePublicId, setServicePublicId] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<AgendaCompleteTarget | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const range = useMemo(() => periodRange(date, period), [date, period]);

  const setRouteState = (next: { date?: string; period?: AgendaPeriod; professional?: string }) => {
    const updated = new URLSearchParams(params);
    if (next.date !== undefined) updated.set('date', next.date);
    if (next.period !== undefined) updated.set('period', next.period);
    if (next.professional !== undefined) {
      if (next.professional === '') updated.delete('professional');
      else updated.set('professional', next.professional);
    }
    setParams(updated);
  };

  const filterQuery = () => {
    const query = new URLSearchParams({ from: range.from, to: range.to });
    if (professionalPublicId !== '') query.set('professionalPublicId', professionalPublicId);
    if (servicePublicId !== '') query.set('servicePublicId', servicePublicId);
    if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
    return query;
  };

  const overview = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'agenda-overview',
      range.from,
      range.to,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    ],
    queryFn: () => {
      const query = filterQuery();
      query.set('offsetMinutes', String(new Date().getTimezoneOffset()));
      return httpClient.request(`/tenant/agenda/overview?${query.toString()}`, {
        schema: AgendaOverviewResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const list = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      'agenda-overview',
      range.from,
      range.to,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
      statusFilter,
      search,
    ],
    queryFn: () => {
      const query = filterQuery();
      if (statusFilter !== '') query.set('status', statusFilter);
      if (search !== '') query.set('search', search);
      return httpClient.request(`/tenant/appointments?${query.toString()}`, {
        schema: AppointmentListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'agenda-overview'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'agenda-overview'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment', selected],
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${selected ?? ''}`, {
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });

  const refreshAgenda = async () => {
    await Promise.all([overview.refetch(), list.refetch()]);
    await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'appointments'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({
      publicId,
      status,
      reason,
    }: {
      publicId: string;
      status: 'confirmed' | 'in_progress' | 'completed' | 'canceled' | 'no_show';
      reason?: string;
    }) =>
      httpClient.request(`/tenant/appointments/${publicId}/${status}`, {
        method: 'POST',
        body: reason === undefined || reason === '' ? {} : { reason },
        schema: AppointmentStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void refreshAgenda();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/appointments/${publicId}/checkin`, {
        method: 'POST',
        body: {},
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setFeedback('Check-in registrado com sucesso.');
      void refreshAgenda();
    },
  });

  const paymentsByAppointment = useMemo(() => {
    const map = new Map<string, { state: AppointmentPaymentState; balanceCents: number }>();
    for (const entry of overview.data?.payments ?? [])
      map.set(entry.appointmentPublicId, {
        state: entry.state,
        balanceCents: Math.max(Number(entry.expectedCents) - Number(entry.receivedCents), 0),
      });
    return map;
  }, [overview.data]);

  const items = (list.data?.items ?? []).filter((item) => {
    if (paymentFilter === '') return true;
    return (paymentsByAppointment.get(item.publicId)?.state ?? 'ON_SITE') === paymentFilter;
  });

  const data = overview.data;
  const financial = data?.financial ?? null;

  const goTo = (direction: -1 | 1) => {
    setRouteState({
      date:
        period === 'month'
          ? addMonths(date, direction)
          : addDays(date, direction * (period === 'week' ? 7 : 1)),
    });
  };

  const createAppointment = () => {
    void navigate('/app/agenda/agendamentos');
  };

  const editAppointment = (publicId: string) => {
    void navigate(`/app/agenda/agendamentos?appointmentPublicId=${publicId}`);
  };

  const openCustomer = (customerPublicId: string) => {
    void navigate(`/app/clientes/${customerPublicId}`);
  };

  const complete = (appointment: Appointment) => {
    const payment = paymentsByAppointment.get(appointment.publicId);
    // Pagamento já confirmado: conclui direto. Caso contrário, resolve o financeiro no diálogo.
    if (!canReadPayments || payment === undefined || payment.state === 'PAID') {
      statusMutation.mutate({ publicId: appointment.publicId, status: 'completed' });
      setFeedback('Atendimento concluído.');
      return;
    }
    setCompleteTarget({
      publicId: appointment.publicId,
      customerName: appointment.customerName,
      balanceCents: payment.balanceCents,
    });
  };

  const cancel = (appointment: Appointment) => {
    setConfirmation({
      title: 'Cancelar agendamento?',
      description: `O agendamento de ${appointment.customerName} será cancelado. Informe o motivo.`,
      confirmLabel: 'Cancelar agendamento',
      requiresReason: true,
      reasonLabel: 'Motivo do cancelamento',
      variant: 'danger',
      onConfirm: async (reason) => {
        await statusMutation.mutateAsync({
          publicId: appointment.publicId,
          status: 'canceled',
          reason,
        });
        setFeedback('Agendamento cancelado.');
      },
    });
  };

  const paymentBadge = (publicId: string) => {
    if (!canReadPayments) return null;
    const state = paymentsByAppointment.get(publicId)?.state;
    if (state === undefined) return null;
    return (
      <span className={`ds-badge ds-badge--${PAYMENT_STATE_TONE[state]}`}>
        {PAYMENT_STATE_LABELS[state]}
      </span>
    );
  };

  const rowActions = (appointment: Appointment) => (
    <div className="ds-row-actions agenda-row-actions">
      <button
        className="secondary-button button--sm"
        type="button"
        onClick={() => {
          setSelected(appointment.publicId);
        }}
      >
        Ver
      </button>
      {canCreate && (
        <button
          className="secondary-button button--sm"
          type="button"
          onClick={() => {
            editAppointment(appointment.publicId);
          }}
        >
          Editar
        </button>
      )}
      <div className="agenda-menu">
        <button
          className="secondary-button button--sm"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === appointment.publicId}
          aria-label="Mais ações"
          onClick={() => {
            setOpenMenu(openMenu === appointment.publicId ? null : appointment.publicId);
          }}
        >
          •••
        </button>
        {openMenu === appointment.publicId && (
          <ul className="agenda-menu-list" role="menu">
            {canManageStatus &&
              nextStatuses(appointment.status).map((status) => (
                <li key={status}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenu(null);
                      statusMutation.mutate({
                        publicId: appointment.publicId,
                        status: status === 'CONFIRMED' ? 'confirmed' : 'in_progress',
                      });
                      setFeedback(
                        status === 'CONFIRMED' ? 'Presença confirmada.' : 'Atendimento iniciado.',
                      );
                    }}
                  >
                    {status === 'CONFIRMED' ? 'Confirmar presença' : 'Iniciar atendimento'}
                  </button>
                </li>
              ))}
            {canManageStatus &&
              (appointment.status === 'CONFIRMED' ||
                appointment.status === 'IN_PROGRESS' ||
                appointment.status === 'PENDING') && (
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenu(null);
                      complete(appointment);
                    }}
                  >
                    Concluir atendimento
                  </button>
                </li>
              )}
            {canCheckIn && appointment.checkedInAt === null && appointment.status !== 'CANCELED' && (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    checkInMutation.mutate(appointment.publicId);
                  }}
                >
                  Registrar chegada
                </button>
              </li>
            )}
            {canCreate && (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    editAppointment(appointment.publicId);
                  }}
                >
                  Reagendar
                </button>
              </li>
            )}
            {canManageStatus && appointment.status !== 'CANCELED' && (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setOpenMenu(null);
                    cancel(appointment);
                  }}
                >
                  Cancelar
                </button>
              </li>
            )}
            {canReadCustomers && (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    openCustomer(appointment.customerPublicId);
                  }}
                >
                  Abrir cliente
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );

  const customerCell = (appointment: Appointment) => (
    <div className="agenda-customer">
      <span className="agenda-avatar" aria-hidden="true">
        {initials(appointment.customerName)}
      </span>
      <span>
        {canReadCustomers ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              openCustomer(appointment.customerPublicId);
            }}
          >
            {appointment.customerName}
          </button>
        ) : (
          <strong>{appointment.customerName}</strong>
        )}
        {appointment.customerPhone !== null && <small>{formatPhone(appointment.customerPhone)}</small>}
      </span>
    </div>
  );

  const blockError = (message: string, retry: () => void) => (
    <div className="ds-inline-alert ds-inline-alert--danger">
      <div>
        <strong>{message}</strong>
      </div>
      <button className="secondary-button button--sm" type="button" onClick={retry}>
        Tentar novamente
      </button>
    </div>
  );

  return (
    <section className="agenda-overview" aria-labelledby="agenda-overview-title">
      <div className="ds-page-header">
        <div>
          <p className="ds-eyebrow">Agenda</p>
          <h2 id="agenda-overview-title">Visão da agenda</h2>
          <p>Visão geral de todos os agendamentos do estabelecimento.</p>
        </div>
        <div className="ds-page-actions agenda-period-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="Período anterior"
            onClick={() => {
              goTo(-1);
            }}
          >
            ‹
          </button>
          <input
            type="date"
            className="control-sm"
            aria-label="Data"
            value={date}
            onChange={(event) => {
              if (isValidDate(event.target.value)) setRouteState({ date: event.target.value });
            }}
          />
          <button
            className="icon-button"
            type="button"
            aria-label="Próximo período"
            onClick={() => {
              goTo(1);
            }}
          >
            ›
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setRouteState({ date: today() });
            }}
          >
            Hoje
          </button>
          <div className="segmented-control">
            {PERIODS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={period === item.value ? 'active' : ''}
                aria-pressed={period === item.value}
                onClick={() => {
                  setRouteState({ period: item.value });
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {canCreate && (
            <button className="primary-button" type="button" onClick={createAppointment}>
              + Novo agendamento
            </button>
          )}
        </div>
      </div>
      <p className="agenda-period-label">{periodLabel(date, period)}</p>
      {feedback !== null && statusMutation.error === null && (
        <p className="success-message" role="status">
          {feedback}
        </p>
      )}
      {statusMutation.error instanceof Error && (
        <p className="form-error" role="alert">
          {statusMutation.error.message}
        </p>
      )}
      {checkInMutation.error instanceof Error && (
        <p className="form-error" role="alert">
          {checkInMutation.error.message}
        </p>
      )}

      {overview.isPending ? (
        <div className="ds-list-skeleton agenda-metrics-skeleton">
          <i />
          <i />
        </div>
      ) : overview.error instanceof Error ? (
        blockError('Não foi possível carregar os indicadores da agenda.', () => {
          void overview.refetch();
        })
      ) : (
        data !== undefined && (
          <>
            <div className="ds-stat-grid">
              <div className="ds-stat-card">
                <small>Agendamentos</small>
                <strong>{data.totals.appointments}</strong>
                <small>Total do período</small>
              </div>
              <div className="ds-stat-card ds-stat-card--warning">
                <small>Pendentes</small>
                <strong>{data.totals.pending}</strong>
                <small>{percentOf(data.totals.pending, data.totals.appointments)} do total</small>
              </div>
              <div className="ds-stat-card">
                <small>Confirmados</small>
                <strong>{data.totals.confirmed}</strong>
                <small>{percentOf(data.totals.confirmed, data.totals.appointments)} do total</small>
              </div>
              <div className="ds-stat-card ds-stat-card--success">
                <small>Concluídos</small>
                <strong>{data.totals.completed}</strong>
                <small>{percentOf(data.totals.completed, data.totals.appointments)} do total</small>
              </div>
              {financial !== null && (
                <>
                  <div className="ds-stat-card ds-stat-card--success">
                    <small>Faturamento recebido</small>
                    <strong>{formatMoneyCents(financial.receivedCents)}</strong>
                    <small>Pagamentos confirmados no período</small>
                  </div>
                  <div className="ds-stat-card">
                    <small>Faturamento previsto</small>
                    <strong>{formatMoneyCents(financial.expectedCents)}</strong>
                    <small>{formatMoneyCents(financial.openCents)} em aberto</small>
                  </div>
                </>
              )}
            </div>
            <div className="agenda-analytics">
              <article className="ds-section-card agenda-panel">
                <header className="ds-section-card-header">
                  <div>
                    <h3>Agendamentos por status</h3>
                  </div>
                </header>
                {data.totals.appointments === 0 ? (
                  <div className="ds-empty-state">
                    <strong>Sem agendamentos no período</strong>
                  </div>
                ) : (
                  <AgendaStatusDonut byStatus={data.byStatus} />
                )}
              </article>
              <article className="ds-section-card agenda-panel">
                <header className="ds-section-card-header">
                  <div>
                    <h3>Agendamentos por profissional</h3>
                    <p>Selecione um profissional para filtrar a lista.</p>
                  </div>
                </header>
                {data.byProfessional.length === 0 ? (
                  <div className="ds-empty-state">
                    <strong>Sem agendamentos no período</strong>
                  </div>
                ) : (
                  <AgendaProfessionalRanking
                    items={data.byProfessional}
                    selected={professionalPublicId}
                    onSelect={(value) => {
                      setRouteState({ professional: value });
                    }}
                  />
                )}
              </article>
              <article className="ds-section-card agenda-panel agenda-analytics-wide">
                <header className="ds-section-card-header">
                  <div>
                    <h3>Horários mais movimentados</h3>
                  </div>
                </header>
                {data.byHour.length === 0 ? (
                  <div className="ds-empty-state">
                    <strong>Sem agendamentos no período</strong>
                  </div>
                ) : (
                  <AgendaHourChart items={data.byHour} />
                )}
              </article>
            </div>
          </>
        )
      )}

      <div className="app-filter-bar agenda-filters">
        <label className="agenda-filter-search">
          Buscar
          <input
            type="search"
            placeholder="Cliente, serviço ou protocolo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[]).map((status) => (
              <option value={status} key={status}>
                {APPOINTMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select
            value={professionalPublicId}
            onChange={(event) => {
              setRouteState({ professional: event.target.value });
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
        {moreFilters && (
          <>
            <label>
              Unidade
              <UnitSelect
                tenantPublicId={tenantPublicId}
                value={unitPublicId}
                onChange={setUnitPublicId}
              />
            </label>
            {canReadPayments && (
              <label>
                Pagamento
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPaymentFilter(event.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  {(Object.keys(PAYMENT_STATE_LABELS) as AppointmentPaymentState[]).map((state) => (
                    <option value={state} key={state}>
                      {PAYMENT_STATE_LABELS[state]}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
        {canCreate && (
          <button className="primary-button" type="button" onClick={createAppointment}>
            + Novo agendamento
          </button>
        )}
      </div>

      {list.isPending ? (
        <div className="ds-list-skeleton">
          <i />
          <i />
          <i />
        </div>
      ) : list.error instanceof Error ? (
        blockError('Não foi possível carregar os atendimentos.', () => {
          void list.refetch();
        })
      ) : items.length === 0 ? (
        <div className="ds-empty-state">
          <strong>Nenhum atendimento neste período</strong>
          <p>Ajuste os filtros ou crie um novo agendamento.</p>
        </div>
      ) : (
        <>
          <div className="ds-table-scroll agenda-table-wrap">
            <table className="platform-table ds-data-table agenda-table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Cliente</th>
                  <th>Profissional</th>
                  <th>Serviço</th>
                  <th>Duração</th>
                  <th>Valor</th>
                  <th>Atendimento</th>
                  {canReadPayments && <th>Pagamento</th>}
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((appointment) => (
                  <tr key={appointment.publicId}>
                    <td>
                      <strong>{hourLabel(appointment.startsAt)}</strong>
                    </td>
                    <td>{customerCell(appointment)}</td>
                    <td>{appointment.professionalName}</td>
                    <td>{appointment.serviceName}</td>
                    <td>{appointment.durationMinutes} min</td>
                    <td>{formatMoneyCents(appointment.priceCents)}</td>
                    <td>
                      <AppointmentStatusBadge status={appointment.status} />
                    </td>
                    {canReadPayments && <td>{paymentBadge(appointment.publicId)}</td>}
                    <td>{rowActions(appointment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="agenda-cards">
            {items.map((appointment) => (
              <li key={appointment.publicId} className="agenda-card">
                <div className="agenda-card-head">
                  <strong>{hourLabel(appointment.startsAt)}</strong>
                  <span>{formatMoneyCents(appointment.priceCents)}</span>
                </div>
                {customerCell(appointment)}
                <p className="agenda-card-service">
                  {appointment.serviceName} · {appointment.professionalName}
                </p>
                <div className="agenda-card-badges">
                  <AppointmentStatusBadge status={appointment.status} />
                  {paymentBadge(appointment.publicId)}
                </div>
                {rowActions(appointment)}
              </li>
            ))}
          </ul>
        </>
      )}

      {selected !== null && (
        <AppointmentDrawer
          item={detail.data}
          loading={detail.isPending}
          error={detail.error instanceof Error}
          onClose={() => {
            setSelected(null);
          }}
          footer={
            canCreate ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  editAppointment(selected);
                }}
              >
                Abrir ações do agendamento
              </button>
            ) : undefined
          }
        />
      )}
      {completeTarget !== null && (
        <AgendaCompleteDialog
          tenantPublicId={tenantPublicId}
          target={completeTarget}
          canManagePayments={canManagePayments}
          onClose={() => {
            setCompleteTarget(null);
          }}
          onCompleted={() => {
            const publicId = completeTarget.publicId;
            setCompleteTarget(null);
            statusMutation.mutate({ publicId, status: 'completed' });
            setFeedback('Atendimento concluído.');
          }}
        />
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
