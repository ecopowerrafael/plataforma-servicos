import {
  CustomerCrmProfileSchema,
  CustomerPublicSchema,
  TenantCustomFieldsResponseSchema,
  UpdateCustomerRequestSchema,
} from '@plataforma/shared';
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCalendarPlus,
  IconPencil,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  customerSince,
  formatDate,
  formatDateTime,
  formatMoneyCents,
  formatPhone,
  formatShortDateTime,
  initials,
  phoneLink,
  relationshipSummary,
  SEGMENT_LABELS,
  SEGMENT_TONE,
  TIMELINE_ICONS,
  whatsappLink,
  whatsappNumber,
} from './customer-crm.js';
import { CustomerForm } from './CustomerForm.js';
import { CustomerTreatmentPlans } from './CustomerTreatmentPlans.js';
import { httpClient } from '../../lib/http.js';
import { AppointmentStatusBadge } from '../appointments/appointment-status.js';
import { EmptyState, ListSkeleton, SectionCard } from '../ui/AppUi.js';

type Profile = ReturnType<typeof CustomerCrmProfileSchema.parse>;
type Tab =
  | 'overview'
  | 'appointments'
  | 'financial'
  | 'loyalty'
  | 'reviews'
  | 'relationship';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'appointments', label: 'Agendamentos' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'loyalty', label: 'Fidelidade' },
  { value: 'reviews', label: 'Avaliações' },
  { value: 'relationship', label: 'Relacionamento' },
];

function AppointmentRow({
  appointment,
  onOpen,
}: {
  appointment: Profile['appointments'][number];
  onOpen: () => void;
}) {
  return (
    <li className="crm-appointment">
      <div>
        <strong>{formatShortDateTime(appointment.startsAt)}</strong>
        <small>
          {appointment.serviceName} · {appointment.professionalName}
        </small>
      </div>
      <AppointmentStatusBadge status={appointment.status} />
      <span>{formatMoneyCents(appointment.priceCents)}</span>
      <button className="secondary-button button--sm" type="button" onClick={onOpen}>
        Ver
      </button>
    </li>
  );
}

export function CustomerProfile({
  tenantPublicId,
  publicId,
  terminology,
  canUpdate = false,
  canReadPayments = false,
  canCreateAppointments = false,
}: {
  tenantPublicId: string;
  publicId: string;
  terminology: string;
  canUpdate?: boolean;
  canReadPayments?: boolean;
  canCreateAppointments?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  // Instante de referência estável para separar próximos de histórico.
  const [renderedAt] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);

  const profile = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-crm', publicId],
    queryFn: () =>
      httpClient.request(`/tenant/customers/${publicId}/crm`, {
        schema: CustomerCrmProfileSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const fields = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-fields'],
    queryFn: () =>
      httpClient.request('/tenant/customer-fields', {
        schema: TenantCustomFieldsResponseSchema,
        tenantPublicId,
      }),
    enabled: editing,
    retry: false,
  });
  const update = useMutation({
    mutationFn: (body: unknown) =>
      httpClient.request(`/tenant/customers/${publicId}`, {
        method: 'PATCH',
        body: UpdateCustomerRequestSchema.parse(body),
        schema: CustomerPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-crm', publicId],
      });
    },
  });

  if (profile.isPending) return <ListSkeleton rows={6} />;
  if (profile.error instanceof Error || profile.data === undefined)
    return (
      <EmptyState
        title={`${terminology} não encontrado.`}
        description="Verifique o endereço ou volte para a lista de clientes."
        action={
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void navigate('/app/clientes');
            }}
          >
            Voltar para clientes
          </button>
        }
      />
    );

  const data = profile.data;
  const customer = data.customer;
  const name = customer.socialName ?? customer.name;
  const whatsapp = whatsappNumber(customer);
  const upcoming = data.appointments.filter(
    (appointment) =>
      ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status) &&
      new Date(appointment.startsAt).getTime() >= renderedAt,
  );
  const history = data.appointments.filter((appointment) => !upcoming.includes(appointment));
  const points = data.relationship.loyaltyBalances.find((balance) => balance.type === 'POINTS');
  const cashback = data.relationship.loyaltyBalances.find((balance) => balance.type === 'CASHBACK');
  const openAppointment = (appointmentPublicId: string) => {
    void navigate(`/app/agenda/agendamentos?appointmentPublicId=${appointmentPublicId}`);
  };
  const newAppointment = () => {
    void navigate(
      `/app/agenda/agendamentos?customerPublicId=${publicId}&returnTo=/app/clientes/${publicId}`,
    );
  };

  return (
    <div className="ds-stack crm-profile" aria-label={`${terminology} ${name}`}>
      <button
        className="text-button crm-back"
        type="button"
        onClick={() => {
          void navigate('/app/clientes');
        }}
      >
        <IconArrowLeft size={16} aria-hidden="true" /> {terminology}s
      </button>

      <header className="crm-profile-header">
        <span className="crm-avatar crm-avatar--lg" aria-hidden="true">
          {initials(name)}
        </span>
        <div className="crm-profile-identity">
          <h2>{name}</h2>
          <p>
            {customer.phone === null ? 'Sem telefone' : formatPhone(customer.phone)}
            {customer.email === null ? '' : ` · ${customer.email}`}
          </p>
          <div className="crm-badges">
            <span
              className={`ds-badge ds-badge--${customer.status === 'ACTIVE' ? 'success' : 'muted'}`}
            >
              {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
            </span>
            {data.relationshipStatus.segments.map((segment) => (
              <span className={`ds-badge ds-badge--${SEGMENT_TONE[segment]}`} key={segment}>
                {SEGMENT_LABELS[segment]}
              </span>
            ))}
            <span className="ds-badge ds-badge--muted">{customerSince(customer.createdAt)}</span>
          </div>
        </div>
        <div className="crm-profile-actions">
          {canCreateAppointments && (
            <button className="primary-button" type="button" onClick={newAppointment}>
              <IconCalendarPlus size={16} aria-hidden="true" /> Novo agendamento
            </button>
          )}
          {whatsapp !== null && (
            <a
              className="secondary-button"
              href={whatsappLink(whatsapp)}
              target="_blank"
              rel="noreferrer"
            >
              <IconBrandWhatsapp size={16} aria-hidden="true" /> WhatsApp
            </a>
          )}
          {customer.phone !== null && (
            <a className="secondary-button" href={phoneLink(customer.phone)}>
              Ligar
            </a>
          )}
          {canUpdate && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditing(true);
              }}
            >
              <IconPencil size={16} aria-hidden="true" /> Editar
            </button>
          )}
        </div>
      </header>

      <div className="ds-stat-grid crm-summary">
        <div className="ds-stat-card">
          <small>Próximo agendamento</small>
          <strong>
            {data.summary.nextAppointment === null
              ? 'Sem agendamento'
              : formatShortDateTime(data.summary.nextAppointment.startsAt)}
          </strong>
          <small>{data.summary.nextAppointment?.serviceName ?? '—'}</small>
        </div>
        <div className="ds-stat-card">
          <small>Última visita</small>
          <strong>
            {data.summary.lastCompleted === null
              ? 'Nunca'
              : formatShortDateTime(data.summary.lastCompleted.startsAt)}
          </strong>
          <small>{data.summary.lastCompleted?.serviceName ?? '—'}</small>
        </div>
        <div className="ds-stat-card">
          <small>Atendimentos concluídos</small>
          <strong>{data.summary.completedCount}</strong>
          <small>
            {data.summary.canceledCount} cancelados · {data.summary.noShowCount} faltas
          </small>
        </div>
        {data.financial !== null && (
          <>
            <div className="ds-stat-card ds-stat-card--success">
              <small>Total gasto</small>
              <strong>{formatMoneyCents(data.financial.paidTotalCents)}</strong>
              <small>{data.financial.paidCount} pagamentos</small>
            </div>
            <div className="ds-stat-card">
              <small>Ticket médio</small>
              <strong>{formatMoneyCents(data.financial.averageTicketCents)}</strong>
            </div>
          </>
        )}
        {points !== undefined && (
          <div className="ds-stat-card">
            <small>Fidelidade</small>
            <strong>{points.balance} pts</strong>
            {cashback !== undefined && (
              <small>{formatMoneyCents(cashback.balance)} em cashback</small>
            )}
          </div>
        )}
      </div>

      <nav className="crm-tabs" aria-label="Seções do cliente">
        {TABS.filter((item) => item.value !== 'financial' || canReadPayments).map((item) => (
          <button
            key={item.value}
            type="button"
            className={tab === item.value ? 'is-active' : ''}
            aria-pressed={tab === item.value}
            onClick={() => {
              setTab(item.value);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="crm-overview">
          <SectionCard title="Linha do tempo" description="Eventos reais do relacionamento.">
            {data.timeline.length === 0 ? (
              <p className="ds-form-hint">Ainda não há eventos registrados para este cliente.</p>
            ) : (
              <ol className="crm-timeline">
                {data.timeline.map((entry, index) => (
                  <li key={`${entry.at}-${String(index)}`}>
                    <span className="crm-timeline-icon" aria-hidden="true">
                      {TIMELINE_ICONS[entry.kind] ?? '•'}
                    </span>
                    <div>
                      <small>{formatDateTime(entry.at)}</small>
                      <strong>{entry.title}</strong>
                      {entry.description !== null && <span>{entry.description}</span>}
                      {entry.amountCents !== null && (
                        <span className="crm-timeline-amount">
                          {formatMoneyCents(entry.amountCents)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
          <SectionCard title="Mais frequente" description="Estatística dos atendimentos concluídos.">
            <dl className="crm-facts">
              <div>
                <dt>Serviço</dt>
                <dd>{data.summary.recurringServices[0]?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{data.summary.recurringProfessionals[0]?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Intervalo médio</dt>
                <dd>
                  {data.relationshipStatus.averageIntervalDays === null
                    ? '—'
                    : `${String(data.relationshipStatus.averageIntervalDays)} dias`}
                </dd>
              </div>
              <div>
                <dt>Cadastrado em</dt>
                <dd>{formatDate(customer.createdAt)}</dd>
              </div>
            </dl>
            {customer.notes !== null && (
              <div className="crm-notes">
                <strong>Observações</strong>
                <p>{customer.notes}</p>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'appointments' && (
        <div className="crm-overview">
          <SectionCard title="Próximos" description={`${String(upcoming.length)} agendamento(s)`}>
            {upcoming.length === 0 ? (
              <p className="ds-form-hint">Nenhum agendamento futuro.</p>
            ) : (
              <ul className="crm-appointments">
                {upcoming.map((appointment) => (
                  <AppointmentRow
                    key={appointment.publicId}
                    appointment={appointment}
                    onOpen={() => {
                      openAppointment(appointment.publicId);
                    }}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Histórico" description={`${String(history.length)} atendimento(s)`}>
            {history.length === 0 ? (
              <p className="ds-form-hint">Nenhum atendimento no histórico.</p>
            ) : (
              <ul className="crm-appointments">
                {history.slice(0, 30).map((appointment) => (
                  <AppointmentRow
                    key={appointment.publicId}
                    appointment={appointment}
                    onOpen={() => {
                      openAppointment(appointment.publicId);
                    }}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
          <CustomerTreatmentPlans tenantPublicId={tenantPublicId} customerPublicId={publicId} />
        </div>
      )}

      {tab === 'financial' && canReadPayments && (
        <SectionCard title="Financeiro" description="Valores recebidos deste cliente.">
          {data.financial === null ? (
            <p className="ds-form-hint">Você não tem permissão para ver os dados financeiros.</p>
          ) : (
            <>
              <dl className="crm-facts">
                <div>
                  <dt>Total gasto</dt>
                  <dd>{formatMoneyCents(data.financial.paidTotalCents)}</dd>
                </div>
                <div>
                  <dt>Ticket médio</dt>
                  <dd>{formatMoneyCents(data.financial.averageTicketCents)}</dd>
                </div>
                <div>
                  <dt>Pagamentos</dt>
                  <dd>{data.financial.paidCount}</dd>
                </div>
                <div>
                  <dt>Último pagamento</dt>
                  <dd>
                    {data.financial.recentPayments[0] === undefined
                      ? '—'
                      : formatShortDateTime(data.financial.recentPayments[0].createdAt)}
                  </dd>
                </div>
              </dl>
              <ul className="crm-appointments">
                {data.financial.recentPayments.map((payment) => (
                  <li className="crm-appointment" key={payment.publicId}>
                    <div>
                      <strong>{formatShortDateTime(payment.createdAt)}</strong>
                      <small>{payment.kind === 'DEPOSIT' ? 'Sinal' : 'Pagamento'}</small>
                    </div>
                    <span className="ds-badge ds-badge--success">Pago</span>
                    <span>{formatMoneyCents(payment.amountCents)}</span>
                    <button
                      className="secondary-button button--sm"
                      type="button"
                      onClick={() => {
                        openAppointment(payment.appointmentPublicId);
                      }}
                    >
                      Ver
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      )}

      {tab === 'loyalty' && (
        <SectionCard title="Fidelidade" description="Saldos e cupons do programa atual.">
          <dl className="crm-facts">
            {data.relationship.loyaltyBalances.map((balance) => (
              <div key={balance.type}>
                <dt>{balance.type === 'POINTS' ? 'Pontos' : 'Cashback'}</dt>
                <dd>
                  {balance.type === 'POINTS'
                    ? `${balance.balance} pts`
                    : formatMoneyCents(balance.balance)}
                </dd>
              </div>
            ))}
          </dl>
          <h4>Cupons utilizados</h4>
          {data.relationship.usedCoupons.length === 0 ? (
            <p className="ds-form-hint">Nenhum cupom utilizado.</p>
          ) : (
            <ul className="crm-simple-list">
              {data.relationship.usedCoupons.map((coupon) => (
                <li key={`${coupon.code}-${coupon.usedAt}`}>
                  <strong>{coupon.code}</strong>
                  <small>{formatDateTime(coupon.usedAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === 'reviews' && (
        <SectionCard title="Avaliações" description="Avaliações deixadas por este cliente.">
          {data.reviews.length === 0 ? (
            <p className="ds-form-hint">Este cliente ainda não avaliou nenhum atendimento.</p>
          ) : (
            <ul className="crm-simple-list">
              {data.reviews.map((review) => (
                <li key={review.publicId}>
                  <strong>{'★'.repeat(review.rating)}</strong>
                  <span>
                    {review.serviceName} · {review.professionalName}
                  </span>
                  {review.comment !== null && <span>{review.comment}</span>}
                  <small>{formatDateTime(review.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === 'relationship' && (
        <div className="crm-overview">
          <SectionCard title="Relacionamento" description={relationshipSummary(data.relationshipStatus)}>
            <dl className="crm-facts">
              <div>
                <dt>Última visita</dt>
                <dd>
                  {data.summary.lastCompleted === null
                    ? 'Nunca'
                    : formatDate(data.summary.lastCompleted.startsAt)}
                </dd>
              </div>
              <div>
                <dt>Dias desde a última visita</dt>
                <dd>{data.relationshipStatus.daysSinceLastVisit ?? '—'}</dd>
              </div>
              <div>
                <dt>Próximo agendamento</dt>
                <dd>
                  {data.summary.nextAppointment === null
                    ? 'Sem agendamento'
                    : formatShortDateTime(data.summary.nextAppointment.startsAt)}
                </dd>
              </div>
              <div>
                <dt>Frequência aproximada</dt>
                <dd>
                  {data.relationshipStatus.averageIntervalDays === null
                    ? '—'
                    : `a cada ${String(data.relationshipStatus.averageIntervalDays)} dias`}
                </dd>
              </div>
              <div>
                <dt>Serviço mais realizado</dt>
                <dd>{data.summary.recurringServices[0]?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Profissional mais frequente</dt>
                <dd>{data.summary.recurringProfessionals[0]?.name ?? '—'}</dd>
              </div>
            </dl>
            <div
              className={`ds-inline-alert ds-inline-alert--${
                data.relationshipStatus.recoveryEligible ? 'warning' : 'info'
              }`}
            >
              <div>
                <strong>
                  {data.relationshipStatus.recoveryEligible
                    ? 'Elegível para recuperação'
                    : 'Relacionamento em dia'}
                </strong>
                <p>
                  {data.relationshipStatus.noReturnAfterDays === null
                    ? 'Configure as regras em Clientes › Recuperação para acompanhar o retorno.'
                    : `A régua de recuperação considera ${String(data.relationshipStatus.noReturnAfterDays)} dias sem retorno.`}
                </p>
              </div>
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  void navigate('/app/clientes/recuperacao');
                }}
              >
                Abrir recuperação
              </button>
            </div>
            <div className="ds-form-actions">
              {whatsapp !== null && (
                <a
                  className="secondary-button"
                  href={whatsappLink(whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Enviar mensagem
                </a>
              )}
              {canCreateAppointments && (
                <button className="primary-button" type="button" onClick={newAppointment}>
                  Criar agendamento
                </button>
              )}
              {canUpdate && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  Adicionar observação
                </button>
              )}
            </div>
          </SectionCard>
          <SectionCard title="WhatsApp" description="Somente o que já está registrado.">
            {data.whatsapp === null ? (
              <p className="ds-form-hint">Nenhuma conversa registrada com este cliente.</p>
            ) : (
              <dl className="crm-facts">
                <div>
                  <dt>Última interação</dt>
                  <dd>{formatDateTime(data.whatsapp.lastInboundAt)}</dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>
                    {data.whatsapp.status === 'HUMAN_SUPPORT'
                      ? 'Atendimento humano'
                      : data.whatsapp.status === 'CLOSED'
                        ? 'Encerrada'
                        : 'Automático'}
                  </dd>
                </div>
              </dl>
            )}
          </SectionCard>
          {data.relationship.waitlist.length > 0 && (
            <SectionCard title="Lista de espera" description="Pedidos ativos deste cliente.">
              <ul className="crm-simple-list">
                {data.relationship.waitlist.map((item) => (
                  <li key={item.publicId}>
                    <strong>{item.serviceName}</strong>
                    <span>
                      {item.preferredDateFrom} a {item.preferredDateTo} ·{' '}
                      {item.preferredTimeStart}–{item.preferredTimeEnd}
                    </span>
                    <small>{item.professionalName ?? 'Qualquer profissional'}</small>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {editing && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog crm-dialog" role="dialog" aria-modal="true" aria-label="Editar cliente">
            <div className="ds-section-card-header">
              <h3>Editar {terminology.toLowerCase()}</h3>
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  setEditing(false);
                }}
              >
                Fechar
              </button>
            </div>
            <CustomerForm
              busy={update.isPending}
              customer={customer}
              error={update.error instanceof Error ? 'Não foi possível salvar o cliente.' : null}
              fields={fields.data?.fields.filter((field) => field.scope === 'CUSTOMER') ?? []}
              terminology={terminology}
              onSave={(value) => update.mutateAsync(value).then(() => undefined)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
