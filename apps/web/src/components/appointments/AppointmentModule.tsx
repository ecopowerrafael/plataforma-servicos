import {
  AgendaOverviewResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
  type AppointmentPaymentState,
} from '@plataforma/shared';
import { IconDots, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  ACTION_LABELS,
  availableActions,
  formatDayLabel,
  formatDuration,
  formatMoneyCents,
  formatPhone,
  formatSource,
  formatTime,
  initials,
  localDate,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONE,
  periodRange,
  whatsappLink,
  type AppointmentAbilities,
  type AppointmentAction,
  type PeriodPreset,
} from './appointment-format.js';
import { AppointmentStatusBadge, type AppointmentStatus } from './appointment-status.js';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer.js';
import { AppointmentEditorDialog } from './AppointmentEditorDialog.js';
import { httpClient } from '../../lib/http.js';
import { AgendaCompleteDialog, type AgendaCompleteTarget } from '../agenda/AgendaCompleteDialog.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { EmptyState, PageHeader } from '../ui/AppUi.js';

type Appointment = ReturnType<typeof AppointmentPublicSchema.parse>;

const STATUS_CHIPS: { value: '' | AppointmentStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'CONFIRMED', label: 'Confirmados' },
  { value: 'IN_PROGRESS', label: 'Em atendimento' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'CANCELED', label: 'Cancelados' },
  { value: 'NO_SHOW', label: 'Faltas' },
];

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Próximos 7 dias' },
  { value: 'month', label: 'Próximos 30 dias' },
  { value: 'past', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Período personalizado' },
];

const PAGE_SIZES = [10, 20, 50];

export function AppointmentModule({
  tenantPublicId,
  canFitIn = false,
  canCheckIn = false,
  canReadPayments = false,
  canManagePayments = false,
  canCreate = false,
  canManageStatus = false,
  canReadCustomers = false,
}: {
  tenantPublicId: string;
  canFitIn?: boolean;
  canCheckIn?: boolean;
  canReadPayments?: boolean;
  canManagePayments?: boolean;
  canCreate?: boolean;
  canManageStatus?: boolean;
  canReadCustomers?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const presetCustomer = searchParams.get('customerPublicId') ?? '';
  const presetAppointment = searchParams.get('appointmentPublicId');
  const returnTo = searchParams.get('returnTo');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | AppointmentStatus>('');
  // Deep link do financeiro: /app/agenda/agendamentos?pagamento=ON_SITE
  const presetPayment = searchParams.get('pagamento');
  const [paymentFilter, setPaymentFilter] = useState<'' | AppointmentPaymentState>(
    presetPayment === 'PAID' ||
      presetPayment === 'PARTIAL' ||
      presetPayment === 'ONLINE_PENDING' ||
      presetPayment === 'ON_SITE'
      ? presetPayment
      : '',
  );
  const [professional, setProfessional] = useState('');
  const [service, setService] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [preset, setPreset] = useState<PeriodPreset>('week');
  const [customRange, setCustomRange] = useState(() => {
    const day = localDate(new Date());
    return { from: day, to: day };
  });
  const [moreFilters, setMoreFilters] = useState(presetPayment !== null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<string | null>(presetAppointment);
  const [editor, setEditor] = useState<{ appointment: Appointment | null } | null>(
    presetCustomer === '' ? null : { appointment: null },
  );
  const [completeTarget, setCompleteTarget] = useState<
    (AgendaCompleteTarget & { mode: 'complete' | 'payment' }) | null
  >(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const range = useMemo(() => periodRange(preset, customRange), [preset, customRange]);

  const resetPage = () => {
    setPage(1);
  };

  const listQuery = () => {
    const query = new URLSearchParams({ from: range.from, to: range.to });
    if (status !== '') query.set('status', status);
    if (professional !== '') query.set('professionalPublicId', professional);
    if (service !== '') query.set('servicePublicId', service);
    if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
    if (search.trim() !== '') query.set('search', search.trim());
    if (presetCustomer !== '') query.set('customerPublicId', presetCustomer);
    return query;
  };

  const list = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      'console',
      range,
      status,
      professional,
      service,
      unitPublicId,
      search,
      presetCustomer,
      page,
      pageSize,
    ],
    queryFn: () => {
      const query = listQuery();
      query.set('page', String(page));
      query.set('limit', String(pageSize));
      return httpClient.request(`/tenant/appointments?${query.toString()}`, {
        schema: AppointmentListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  // Situação financeira do mesmo período, só com permissão de leitura de pagamentos.
  const payments = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      'console-payments',
      range,
      professional,
      service,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      if (professional !== '') query.set('professionalPublicId', professional);
      if (service !== '') query.set('servicePublicId', service);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      query.set('offsetMinutes', String(new Date().getTimezoneOffset()));
      return httpClient.request(`/tenant/agenda/overview?${query.toString()}`, {
        schema: AgendaOverviewResponseSchema,
        tenantPublicId,
      });
    },
    enabled: canReadPayments,
    retry: false,
  });

  const paymentStates = useMemo(() => {
    const map = new Map<string, { state: AppointmentPaymentState; balanceCents: number }>();
    for (const entry of payments.data?.payments ?? [])
      map.set(entry.appointmentPublicId, {
        state: entry.state,
        balanceCents: Math.max(Number(entry.expectedCents) - Number(entry.receivedCents), 0),
      });
    return map;
  }, [payments.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'appointments'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({
      publicId,
      transition,
      reason,
    }: {
      publicId: string;
      transition: 'confirmed' | 'in_progress' | 'completed' | 'canceled' | 'no_show';
      reason?: string;
    }) =>
      httpClient.request(`/tenant/appointments/${publicId}/${transition}`, {
        method: 'POST',
        body: reason === undefined || reason === '' ? {} : { reason },
        schema: AppointmentStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void refresh();
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
      setFeedback('Check-in registrado.');
      void refresh();
    },
  });

  const abilities: AppointmentAbilities = {
    canManageStatus,
    canCheckIn,
    canCreate,
    canReadCustomers,
    canManagePayments,
  };

  const items = (list.data?.items ?? []).filter((item) => {
    if (paymentFilter === '') return true;
    return paymentStates.get(item.publicId)?.state === paymentFilter;
  });
  const total = list.data?.total ?? items.length;
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  const runAction = (appointment: Appointment, action: AppointmentAction) => {
    setOpenMenu(null);
    if (action === 'confirm')
      statusMutation.mutate({ publicId: appointment.publicId, transition: 'confirmed' });
    else if (action === 'start')
      statusMutation.mutate({ publicId: appointment.publicId, transition: 'in_progress' });
    else if (action === 'checkin') checkInMutation.mutate(appointment.publicId);
    else if (action === 'complete') {
      const payment = paymentStates.get(appointment.publicId);
      if (!canReadPayments || payment === undefined || payment.state === 'PAID') {
        statusMutation.mutate({ publicId: appointment.publicId, transition: 'completed' });
        return;
      }
      setCompleteTarget({
        publicId: appointment.publicId,
        customerName: appointment.customerName,
        balanceCents: payment.balanceCents,
        mode: 'complete',
      });
    } else if (action === 'payment')
      setCompleteTarget({
        publicId: appointment.publicId,
        customerName: appointment.customerName,
        balanceCents: paymentStates.get(appointment.publicId)?.balanceCents ?? 0,
        mode: 'payment',
      });
    else if (action === 'reschedule' || action === 'notes')
      setEditor({ appointment });
    else if (action === 'customer')
      void navigate(`/app/clientes/${appointment.customerPublicId}`);
    else if (action === 'whatsapp' && appointment.customerPhone !== null)
      window.open(whatsappLink(appointment.customerPhone), '_blank', 'noreferrer');
    else if (action === 'no_show')
      setConfirmation({
        title: 'Marcar falta do cliente?',
        description: `${appointment.customerName} será registrado como falta.`,
        confirmLabel: 'Marcar falta',
        requiresReason: false,
        variant: 'danger',
        onConfirm: async (reason) => {
          await statusMutation.mutateAsync({
            publicId: appointment.publicId,
            transition: 'no_show',
            reason,
          });
        },
      });
    else if (action === 'cancel')
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
            transition: 'canceled',
            reason,
          });
        },
      });
  };

  const actionMenu = (appointment: Appointment) => {
    const actions = availableActions(appointment, abilities);
    if (actions.length === 0) return null;
    return (
      <div className="appointments-menu">
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
          <IconDots size={16} aria-hidden="true" />
        </button>
        {openMenu === appointment.publicId && (
          <ul className="appointments-menu-list" role="menu">
            {actions.map((action) => (
              <li key={action}>
                <button
                  type="button"
                  role="menuitem"
                  className={action === 'cancel' ? 'is-danger' : ''}
                  onClick={() => {
                    runAction(appointment, action);
                  }}
                >
                  {ACTION_LABELS[action]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const paymentBadge = (publicId: string) => {
    if (!canReadPayments) return null;
    const state = paymentStates.get(publicId)?.state;
    if (state === undefined) return null;
    return (
      <span className={`ds-badge ds-badge--${PAYMENT_STATE_TONE[state]}`}>
        {PAYMENT_STATE_LABELS[state]}
      </span>
    );
  };

  const customerCell = (appointment: Appointment) => (
    <div className="appointments-customer">
      <span className="appointments-avatar" aria-hidden="true">
        {initials(appointment.customerName)}
      </span>
      <span>
        {canReadCustomers ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void navigate(`/app/clientes/${appointment.customerPublicId}`);
            }}
          >
            {appointment.customerName}
          </button>
        ) : (
          <strong>{appointment.customerName}</strong>
        )}
        {canReadCustomers && appointment.customerPhone !== null && (
          <small>{formatPhone(appointment.customerPhone)}</small>
        )}
      </span>
    </div>
  );

  const detailsButton = (appointment: Appointment) => (
    <button
      className="secondary-button button--sm"
      type="button"
      onClick={() => {
        setSelected(appointment.publicId);
      }}
    >
      Ver detalhes
    </button>
  );

  return (
    <div className="ds-stack appointments-console" aria-label="Agendamentos">
      <PageHeader
        eyebrow="Agenda"
        title="Agendamentos"
        description="Pesquise, filtre e gerencie todos os atendimentos."
        actions={
          canCreate ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditor({ appointment: null });
              }}
            >
              <IconPlus size={16} aria-hidden="true" /> Novo agendamento
            </button>
          ) : undefined
        }
      />

      <div className="app-filter-bar appointments-filters">
        <label className="appointments-filter-search">
          Buscar
          <span className="appointments-search-field">
            <IconSearch size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Cliente, serviço ou protocolo"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
            />
          </span>
        </label>
        <label>
          Período
          <select
            value={preset}
            onChange={(event) => {
              setPreset(event.target.value as PeriodPreset);
              resetPage();
            }}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label>
              De
              <input
                type="date"
                value={customRange.from}
                onChange={(event) => {
                  setCustomRange({ ...customRange, from: event.target.value });
                  resetPage();
                }}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={customRange.to}
                onChange={(event) => {
                  setCustomRange({ ...customRange, to: event.target.value });
                  resetPage();
                }}
              />
            </label>
          </>
        )}
        <label>
          Profissional
          <select
            value={professional}
            onChange={(event) => {
              setProfessional(event.target.value);
              resetPage();
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
              setService(event.target.value);
              resetPage();
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
                onChange={(value) => {
                  setUnitPublicId(value);
                  resetPage();
                }}
              />
            </label>
            {canReadPayments && (
              <label>
                Pagamento
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPaymentFilter(event.target.value as '' | AppointmentPaymentState);
                  }}
                >
                  <option value="">Todos pagamentos</option>
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
      </div>

      <div className="appointments-chips" role="group" aria-label="Filtros rápidos">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={status === chip.value ? 'is-active' : ''}
            aria-pressed={status === chip.value}
            onClick={() => {
              setStatus(chip.value);
              resetPage();
            }}
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          className={preset === 'today' ? 'is-active' : ''}
          aria-pressed={preset === 'today'}
          onClick={() => {
            setPreset('today');
            resetPage();
          }}
        >
          Hoje
        </button>
      </div>

      {feedback !== null && (
        <p className="success-message" role="status">
          {feedback}
        </p>
      )}
      {statusMutation.error instanceof Error && (
        <p className="form-error" role="alert">
          {statusMutation.error.message}
        </p>
      )}
      {returnTo !== null && (
        <div className="ds-inline-alert ds-inline-alert--info">
          <div>
            <strong>Você veio da ficha de um cliente.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void navigate(returnTo);
            }}
          >
            Voltar ao cliente
          </button>
        </div>
      )}

      {list.isPending ? (
        <div className="ds-list-skeleton">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : list.error instanceof Error ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar os agendamentos.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void list.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento encontrado com estes filtros."
          description="Ajuste a busca, o período ou os filtros para encontrar o atendimento."
        />
      ) : (
        <>
          <div className="ds-table-scroll appointments-table-wrap">
            <table className="platform-table ds-data-table appointments-table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Valor</th>
                  <th>Atendimento</th>
                  {canReadPayments && <th>Pagamento</th>}
                  <th>Origem</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((appointment) => (
                  <tr key={appointment.publicId}>
                    <td>
                      <div className="appointments-when">
                        <strong>{formatTime(appointment.startsAt)}</strong>
                        <small>{formatDayLabel(appointment.startsAt)}</small>
                      </div>
                    </td>
                    <td>{customerCell(appointment)}</td>
                    <td>
                      <div className="appointments-service">
                        <span>{appointment.serviceName}</span>
                        <small>{formatDuration(appointment.durationMinutes)}</small>
                      </div>
                    </td>
                    <td>{appointment.professionalName}</td>
                    <td>{formatMoneyCents(appointment.priceCents)}</td>
                    <td>
                      <AppointmentStatusBadge status={appointment.status} />
                    </td>
                    {canReadPayments && <td>{paymentBadge(appointment.publicId)}</td>}
                    <td>
                      <span className="ds-badge ds-badge--muted">
                        {formatSource(appointment.source)}
                      </span>
                    </td>
                    <td>
                      <div className="ds-row-actions appointments-row-actions">
                        {detailsButton(appointment)}
                        {actionMenu(appointment)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="appointments-cards">
            {items.map((appointment) => (
              <li className="appointments-card" key={appointment.publicId}>
                <div className="appointments-card-head">
                  <strong>{formatTime(appointment.startsAt)}</strong>
                  <small>{formatDayLabel(appointment.startsAt)}</small>
                  <span>{formatMoneyCents(appointment.priceCents)}</span>
                </div>
                {customerCell(appointment)}
                <p className="appointments-card-service">
                  {appointment.serviceName} · {formatDuration(appointment.durationMinutes)} ·{' '}
                  {appointment.professionalName}
                </p>
                <div className="appointments-card-badges">
                  <AppointmentStatusBadge status={appointment.status} />
                  {paymentBadge(appointment.publicId)}
                  <span className="ds-badge ds-badge--muted">
                    {formatSource(appointment.source)}
                  </span>
                </div>
                <div className="ds-row-actions appointments-row-actions">
                  {detailsButton(appointment)}
                  {actionMenu(appointment)}
                </div>
              </li>
            ))}
          </ul>

          <div className="ds-pagination appointments-pagination">
            <span className="appointments-pagination-count">
              Mostrando {firstRow}–{lastRow} de {total}
            </span>
            <label className="appointments-page-size">
              Por página
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  resetPage();
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button button--sm"
              type="button"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              ‹
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              className="secondary-button button--sm"
              type="button"
              disabled={page >= pageCount}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              ›
            </button>
          </div>
        </>
      )}

      {selected !== null && (
        <AppointmentDetailDrawer
          tenantPublicId={tenantPublicId}
          appointmentPublicId={selected}
          paymentState={paymentStates.get(selected)?.state}
          canReadPayments={canReadPayments}
          canManagePayments={canManagePayments}
          canReadCustomers={canReadCustomers}
          onClose={() => {
            setSelected(null);
          }}
          onOpenCustomer={(customerPublicId) => {
            void navigate(`/app/clientes/${customerPublicId}`);
          }}
          footer={
            <div className="ds-form-actions">
              {items
                .filter((item) => item.publicId === selected)
                .flatMap((appointment) =>
                  availableActions(appointment, abilities)
                    .filter((action) => action !== 'notes' && action !== 'customer')
                    .slice(0, 4)
                    .map((action) => (
                      <button
                        key={action}
                        className={action === 'cancel' ? 'secondary-button' : 'primary-button'}
                        type="button"
                        onClick={() => {
                          runAction(appointment, action);
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    )),
                )}
            </div>
          }
        />
      )}

      {editor !== null && (
        <AppointmentEditorDialog
          tenantPublicId={tenantPublicId}
          appointment={editor.appointment}
          presetCustomerPublicId={presetCustomer}
          canFitIn={canFitIn}
          onClose={() => {
            setEditor(null);
          }}
          onSaved={(message) => {
            setEditor(null);
            setFeedback(message);
            void refresh();
          }}
        />
      )}

      {completeTarget !== null && (
        <AgendaCompleteDialog
          tenantPublicId={tenantPublicId}
          target={completeTarget}
          canManagePayments={canManagePayments}
          mode={completeTarget.mode}
          onClose={() => {
            setCompleteTarget(null);
          }}
          onCompleted={() => {
            const { publicId, mode } = completeTarget;
            setCompleteTarget(null);
            if (mode === 'complete')
              statusMutation.mutate({ publicId, transition: 'completed' });
            else void refresh();
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
    </div>
  );
}
