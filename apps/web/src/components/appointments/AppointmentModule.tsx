import {
  AppointmentHistoryResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  CreateAppointmentRequestSchema,
  UpdateAppointmentRequestSchema,
  CustomerListResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type ZodType } from 'zod';

import { AppointmentPaymentsPanel } from './AppointmentPaymentsPanel.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

const now = () => new Date().toISOString().slice(0, 16);
const historyActionLabel = (action: 'CREATED' | 'STATUS_CHANGED' | 'RESCHEDULED' | 'CHECKED_IN') =>
  action === 'CREATED'
    ? 'Criado'
    : action === 'RESCHEDULED'
      ? 'Reagendado'
      : action === 'CHECKED_IN'
        ? 'Check-in'
        : 'Status alterado';
const checkInEligibleStatuses = new Set(['PENDING', 'CONFIRMED', 'IN_PROGRESS']);
export function AppointmentModule({
  tenantPublicId,
  canFitIn = false,
  canCheckIn = false,
  canReadPayments = false,
  canManagePayments = false,
}: {
  tenantPublicId: string;
  canFitIn?: boolean;
  canCheckIn?: boolean;
  canReadPayments?: boolean;
  canManagePayments?: boolean;
}) {
  const client = useQueryClient();
  const [from, setFrom] = useState(() => new Date().toISOString());
  const [to, setTo] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString());
  const [customer, setCustomer] = useState('');
  const [professional, setProfessional] = useState('');
  const [service, setService] = useState('');
  const [unitPublicId, setUnitPublicId] = useState('');
  const [startsAt, setStartsAt] = useState(now);
  const [notes, setNotes] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isFitIn, setIsFitIn] = useState(false);
  const [depositType, setDepositType] = useState('');
  const [depositValue, setDepositValue] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customers', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/customers?limit=100&active=true', {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      }),
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
  const list = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'appointments',
      from,
      to,
      statusFilter,
      customer,
      professional,
      service,
      unitPublicId,
      search,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ from, to });
      if (statusFilter !== '') query.set('status', statusFilter);
      if (customer !== '') query.set('customerPublicId', customer);
      if (professional !== '') query.set('professionalPublicId', professional);
      if (service !== '') query.set('servicePublicId', service);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      if (search !== '') query.set('search', search);
      return httpClient.request(`/tenant/appointments?${query.toString()}`, {
        schema: AppointmentListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      method,
      body,
      schema,
    }: {
      url: string;
      method: 'POST' | 'PATCH';
      body: unknown;
      schema: ZodType;
    }) => httpClient.request(url, { method, body, schema, tenantPublicId }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'appointments'] }),
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
  const history = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment', selected, 'history'],
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${selected ?? ''}/history`, {
        schema: AppointmentHistoryResponseSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const submit = async (fitInReason?: string) => {
    await mutation.mutateAsync({
      url: selected === null ? '/tenant/appointments' : `/tenant/appointments/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: (selected === null
        ? CreateAppointmentRequestSchema
        : UpdateAppointmentRequestSchema
      ).parse({
        customerPublicId: customer,
        professionalPublicId: professional,
        servicePublicId: service,
        ...(unitPublicId === '' ? {} : { unitPublicId }),
        startsAt: new Date(startsAt).toISOString(),
        notes: notes === '' ? null : notes,
        source: 'INTERNAL',
        ...(selected === null || rescheduleReason === '' ? {} : { rescheduleReason }),
        isFitIn,
        ...(isFitIn ? { fitInReason } : {}),
        ...(depositType === ''
          ? {}
          : {
              depositType,
              depositValue:
                depositType === 'FIXED'
                  ? Math.round(Number(depositValue.replace(',', '.')) * 100)
                  : Number(depositValue),
            }),
      }),
      schema: AppointmentPublicSchema,
    });
    setNotes('');
    setRescheduleReason('');
    setIsFitIn(false);
    setDepositType('');
    setDepositValue('');
    setFeedback(
      selected === null ? 'Agendamento criado com sucesso.' : 'Agendamento atualizado com sucesso.',
    );
    await history.refetch();
  };
  const create = () => {
    if (isFitIn) {
      setConfirmation({
        title: 'Confirmar encaixe administrativo?',
        description:
          'O encaixe ignora as regras normais de horário de funcionamento, jornada e antecedência mínima. Ele continua respeitando conflitos reais de agenda do profissional. Informe o motivo.',
        confirmLabel: 'Confirmar encaixe',
        requiresReason: true,
        reasonLabel: 'Motivo do encaixe',
        variant: 'danger',
        onConfirm: async (reason) => {
          await submit(reason);
        },
      });
      return;
    }
    void submit();
  };
  const transition = (
    status: 'confirmed' | 'in_progress' | 'canceled' | 'completed' | 'no_show',
  ) => {
    if (selected === null) return;
    setConfirmation({
      title: 'Confirmar alteração?',
      description:
        status === 'canceled'
          ? 'Informe o motivo no campo abaixo.'
          : 'A ação atualiza o status do agendamento.',
      confirmLabel: 'Confirmar',
      requiresReason: status === 'canceled',
      variant: status === 'canceled' ? 'danger' : 'default',
      onConfirm: async (reason) => {
        await mutation.mutateAsync({
          url: `/tenant/appointments/${selected}/${status}`,
          method: 'POST',
          body: { reason },
          schema: AppointmentStatusResponseSchema,
        });
        setFeedback('Status do agendamento atualizado com sucesso.');
      },
    });
  };
  const checkIn = () => {
    if (selected === null) return;
    void mutation
      .mutateAsync({
        url: `/tenant/appointments/${selected}/checkin`,
        method: 'POST',
        body: {},
        schema: AppointmentPublicSchema,
      })
      .then(() => {
        setFeedback('Check-in registrado com sucesso.');
      });
  };
  return (
    <section className="sessions-panel appointment-module">
      <div className="module-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>Agendamentos</h2>
          <p>Organize os próximos atendimentos da sua equipe.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setSelected(null);
            setEditorOpen(true);
          }}
        >
          Novo agendamento
        </button>
      </div>
      <details className="ds-toolbar-disclosure">
        <summary>Filtros</summary>
        <div className="app-filter-bar ds-toolbar--appointments">
          <label>
            De
            <input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(event) => {
                setFrom(new Date(event.target.value).toISOString());
              }}
            />
          </label>
          <label>
            Até
            <input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(event) => {
                setTo(new Date(event.target.value).toISOString());
              }}
            />
          </label>
          <label>
            Filtrar por status
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="IN_PROGRESS">Em atendimento</option>
              <option value="COMPLETED">Concluído</option>
              <option value="CANCELED">Cancelado</option>
              <option value="NO_SHOW">Falta</option>
            </select>
          </label>
          <label>
            Buscar por cliente ou protocolo
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              const start = new Date();
              start.setHours(0, 0, 0, 0);
              const end = new Date();
              end.setHours(23, 59, 59, 999);
              setFrom(start.toISOString());
              setTo(end.toISOString());
            }}
          >
            Hoje (recepção)
          </button>
        </div>
      </details>
      {editorOpen && (
        <div className="app-drawer platform-form">
          <div className="drawer-header">
            <div>
              <h3>{selected === null ? 'Novo agendamento' : 'Editar agendamento'}</h3>
              <p>Preencha os dados para reservar este horário.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditorOpen(false);
              }}
            >
              Fechar
            </button>
          </div>
          {selected !== null && (
            <label>
              Motivo do reagendamento
              <input
                value={rescheduleReason}
                onChange={(event) => {
                  setRescheduleReason(event.target.value);
                }}
              />
            </label>
          )}
          <label>
            Cliente
            <select
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
              }}
            >
              <option value="">Selecione</option>
              {customers.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional
            <select
              value={professional}
              onChange={(e) => {
                setProfessional(e.target.value);
              }}
            >
              <option value="">Selecione</option>
              {professionals.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.publicName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Serviço
            <select
              value={service}
              onChange={(e) => {
                setService(e.target.value);
              }}
            >
              <option value="">Selecione</option>
              {services.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
              }}
            />
          </label>
          <label>
            Unidade
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unitPublicId}
              onChange={(value) => {
                setUnitPublicId(value);
              }}
            />
          </label>
          <label>
            Observações
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
            />
          </label>
          {canFitIn && (
            <label>
              <input
                checked={isFitIn}
                type="checkbox"
                onChange={(event) => {
                  setIsFitIn(event.target.checked);
                }}
              />
              {' Encaixe administrativo (ignora horário normal, exige motivo e confirmação)'}
            </label>
          )}
          <label>
            Sinal (opcional)
            <select
              value={depositType}
              onChange={(event) => {
                setDepositType(event.target.value);
              }}
            >
              <option value="">Sem sinal</option>
              <option value="FIXED">Valor fixo (R$)</option>
              <option value="PERCENTAGE">Percentual (%)</option>
            </select>
          </label>
          {depositType !== '' && (
            <label>
              {depositType === 'FIXED' ? 'Valor do sinal (R$)' : 'Percentual do sinal (%)'}
              <input
                type="number"
                min="0"
                step={depositType === 'FIXED' ? '0.01' : '1'}
                value={depositValue}
                onChange={(event) => {
                  setDepositValue(event.target.value);
                }}
              />
            </label>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={
              mutation.isPending || customer === '' || professional === '' || service === ''
            }
            onClick={create}
          >
            {selected === null ? 'Criar agendamento' : 'Salvar alterações'}
          </button>
        </div>
      )}
      {feedback !== null && <p className="form-success">{feedback}</p>}
      {mutation.error instanceof Error && (
        <p className="form-error">
          N\u00e3o foi poss\u00edvel salvar o agendamento. Revise os dados e tente novamente.
        </p>
      )}
      <div className="data-list entity-list">
        {list.data?.items.map((item) => (
          <button
            className="data-row"
            type="button"
            key={item.publicId}
            onClick={() => {
              setSelected(item.publicId);
              setEditorOpen(true);
            }}
          >
            <span>{item.protocol}</span>
            <span>{new Date(item.startsAt).toLocaleString('pt-BR')}</span>
            <span>{item.customerName}</span>
            <span>{item.professionalName}</span>
            <span>{item.status}</span>
            <span>{item.priceCents}</span>
            {item.isFitIn && <span>Encaixe</span>}
            {item.checkedInAt !== null && (
              <span>{`Check-in: ${new Date(item.checkedInAt).toLocaleString('pt-BR')}`}</span>
            )}
          </button>
        ))}
      </div>
      {list.data?.items.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhum agendamento neste período</strong>
          <span>Altere os filtros ou crie um novo atendimento.</span>
        </div>
      ) : null}
      {selected !== null && (
        <section className="sessions-panel" aria-label="Detalhes do agendamento">
          {detail.isPending ? <p>Carregando detalhes...</p> : null}
          {detail.error instanceof Error ? (
            <p className="form-error">
              N\u00e3o foi poss\u00edvel carregar os detalhes do agendamento.
            </p>
          ) : null}
          {detail.data !== undefined && (
            <dl className="detail-list">
              <div>
                <dt>Protocolo</dt>
                <dd>{detail.data.protocol}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{detail.data.customerName}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{detail.data.professionalName}</dd>
              </div>
              <div>
                <dt>Servi\u00e7o</dt>
                <dd>{detail.data.serviceName}</dd>
              </div>
              <div>
                <dt>Unidade</dt>
                <dd>{detail.data.unitName ?? 'N\u00e3o informada'}</dd>
              </div>
              <div>
                <dt>In\u00edcio</dt>
                <dd>{new Date(detail.data.startsAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt>T\u00e9rmino</dt>
                <dd>{new Date(detail.data.endsAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt>Dura\u00e7\u00e3o</dt>
                <dd>{detail.data.durationMinutes} min</dd>
              </div>
              <div>
                <dt>Pausa p\u00f3s-servi\u00e7o</dt>
                <dd>{detail.data.postServiceBreakMinutes} min</dd>
              </div>
              <div>
                <dt>Pre\u00e7o</dt>
                <dd>{detail.data.priceCents}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detail.data.status}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>{detail.data.source}</dd>
              </div>
              {detail.data.notes !== null && (
                <div>
                  <dt>Observa\u00e7\u00f5es</dt>
                  <dd>{detail.data.notes}</dd>
                </div>
              )}
              {detail.data.rescheduleReason !== null && (
                <div>
                  <dt>Motivo do reagendamento</dt>
                  <dd>{detail.data.rescheduleReason}</dd>
                </div>
              )}
              {detail.data.canceledReason !== null && (
                <div>
                  <dt>Motivo do cancelamento</dt>
                  <dd>{detail.data.canceledReason}</dd>
                </div>
              )}
              {detail.data.isFitIn && (
                <div>
                  <dt>Encaixe administrativo</dt>
                  <dd>{detail.data.fitInReason ?? 'Sem motivo registrado'}</dd>
                </div>
              )}
              <div>
                <dt>Check-in</dt>
                <dd>
                  {detail.data.checkedInAt === null
                    ? 'Não registrado'
                    : new Date(detail.data.checkedInAt).toLocaleString('pt-BR')}
                </dd>
              </div>
              {detail.data.depositType !== null && (
                <div>
                  <dt>Sinal</dt>
                  <dd>
                    {detail.data.depositType === 'PERCENTAGE'
                      ? `${String(detail.data.depositPercentage)}%`
                      : 'Valor fixo'}
                    {detail.data.depositAmountCents !== null &&
                      ` — R$ ${(Number(detail.data.depositAmountCents) / 100).toFixed(2)}`}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {detail.data !== undefined && (
            <section aria-label="Histórico do agendamento">
              <h4>Histórico</h4>
              {history.isPending ? <p>Carregando histórico…</p> : null}
              {history.error instanceof Error ? (
                <p className="form-error">Não foi possível carregar o histórico.</p>
              ) : null}
              <ul>
                {history.data?.items.map((entry) => (
                  <li key={entry.publicId}>
                    <span>{new Date(entry.createdAt).toLocaleString('pt-BR')}</span>
                    <span>{` ${historyActionLabel(entry.action)}`}</span>
                    {entry.previousStatus !== null && entry.newStatus !== null && (
                      <span>{` ${entry.previousStatus} → ${entry.newStatus}`}</span>
                    )}
                    {entry.previousStartsAt !== null && entry.newStartsAt !== null && (
                      <span>{` ${new Date(entry.previousStartsAt).toLocaleString('pt-BR')} → ${new Date(entry.newStartsAt).toLocaleString('pt-BR')}`}</span>
                    )}
                    {entry.isFitIn && <span> · Encaixe</span>}
                    {entry.reason !== null && <span>{` · ${entry.reason}`}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(canReadPayments || canManagePayments) && (
            <AppointmentPaymentsPanel
              tenantPublicId={tenantPublicId}
              appointmentPublicId={selected}
              canRead={canReadPayments}
              canManage={canManagePayments}
            />
          )}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                if (detail.data === undefined) return;
                setCustomer(detail.data.customerPublicId);
                setProfessional(detail.data.professionalPublicId);
                setService(detail.data.servicePublicId);
                setStartsAt(detail.data.startsAt.slice(0, 16));
                setNotes(detail.data.notes ?? '');
                setDepositType(detail.data.depositType ?? '');
                setDepositValue(
                  detail.data.depositType === 'FIXED' && detail.data.depositAmountCents !== null
                    ? (Number(detail.data.depositAmountCents) / 100).toString()
                    : detail.data.depositType === 'PERCENTAGE' &&
                        detail.data.depositPercentage !== null
                      ? detail.data.depositPercentage.toString()
                      : '',
                );
              }}
            >
              Editar
            </button>
            {canCheckIn &&
              detail.data !== undefined &&
              checkInEligibleStatuses.has(detail.data.status) &&
              detail.data.checkedInAt === null && (
                <button type="button" onClick={checkIn}>
                  Check-in
                </button>
              )}
            <button
              type="button"
              onClick={() => {
                transition('confirmed');
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => {
                transition('completed');
              }}
            >
              Concluir
            </button>
            <button
              type="button"
              onClick={() => {
                transition('in_progress');
              }}
            >
              Iniciar
            </button>
            <button
              type="button"
              onClick={() => {
                transition('no_show');
              }}
            >
              Marcar falta
            </button>
            <button
              type="button"
              onClick={() => {
                transition('canceled');
              }}
            >
              Cancelar
            </button>
          </div>
        </section>
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
