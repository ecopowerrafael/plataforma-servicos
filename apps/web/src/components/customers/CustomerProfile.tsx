import {
  CreateCustomerRequestSchema,
  CustomerCrmProfileSchema,
  CustomerPublicSchema,
  TenantCustomFieldsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CustomerForm } from './CustomerForm.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, StatusBadge } from '../ui/AppUi.js';

const money = (cents: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(cents) / 100,
  );
const date = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(
    'pt-BR',
    options ?? { day: '2-digit', month: 'short', year: 'numeric' },
  ).format(new Date(value));
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
const statusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Falta',
};

function AppointmentCard({
  appointment,
}: {
  appointment: ReturnType<typeof CustomerCrmProfileSchema.parse>['appointments'][number];
}) {
  return (
    <article className="crm-appointment-card">
      <time dateTime={appointment.startsAt}>{dateTime(appointment.startsAt)}</time>
      <div>
        <strong>{appointment.serviceName}</strong>
        <span>{appointment.professionalName}</span>
        <span>{appointment.unitName ?? 'Sem unidade'}</span>
      </div>
      <div>
        <StatusBadge
          active={appointment.status === 'COMPLETED' || appointment.status === 'CONFIRMED'}
        >
          {statusLabel[appointment.status]}
        </StatusBadge>
        <span>{money(appointment.priceCents)}</span>
      </div>
    </article>
  );
}

export function CustomerProfile({
  tenantPublicId,
  publicId,
  terminology,
}: {
  tenantPublicId: string;
  publicId: string;
  terminology: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'appointments' | 'relationship' | 'financial'>(
    'overview',
  );
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
        body: CreateCustomerRequestSchema.parse(body),
        schema: CustomerPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['tenant', tenantPublicId, 'customer-crm', publicId],
        }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'customers'] }),
      ]);
    },
  });
  if (profile.isPending)
    return (
      <section className="sessions-panel">
        <ListSkeleton rows={7} />
      </section>
    );
  if (profile.error instanceof Error || profile.data === undefined)
    return (
      <section className="sessions-panel">
        <EmptyState
          title="Não foi possível carregar este cliente."
          description="O cadastro pode não existir ou você pode não ter acesso."
          action={
            <>
              <button onClick={() => void profile.refetch()}>Tentar novamente</button>
              <button className="secondary-button" onClick={() => void navigate('/app/clientes')}>
                Voltar
              </button>
            </>
          }
        />
      </section>
    );
  const data = profile.data;
  const customer = data.customer;
  const displayName = customer.socialName ?? customer.name;
  const contactPhone = customer.whatsapp ?? customer.phone;
  const schedule = () =>
    void navigate(
      `/app/agenda/agendamentos?customerPublicId=${customer.publicId}&returnTo=${encodeURIComponent(`/app/clientes/${customer.publicId}`)}`,
    );
  return (
    <section className="sessions-panel crm-profile">
      <button
        className="crm-back-button"
        type="button"
        onClick={() => void navigate('/app/clientes')}
      >
        ← Clientes
      </button>
      <header className="crm-profile-header">
        <div className="crm-avatar" aria-hidden="true">
          {displayName
            .split(/\s+/u)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()}
        </div>
        <div className="crm-profile-header__identity">
          <div>
            <h2>{displayName}</h2>
            <StatusBadge active={customer.status === 'ACTIVE'}>
              {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
            </StatusBadge>
          </div>
          <p>Cliente desde {date(customer.createdAt, { month: 'long', year: 'numeric' })}</p>
          <span>{customer.phone ?? 'Telefone não informado'}</span>
          <span>{customer.email ?? 'E-mail não informado'}</span>
        </div>
        <div className="crm-quick-actions">
          <button className="primary-button" type="button" onClick={schedule}>
            + Novo agendamento
          </button>
          {contactPhone !== null && (
            <a
              className="secondary-button"
              href={`https://wa.me/55${contactPhone.replace(/\D/gu, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          )}
          <button className="secondary-button" type="button" onClick={() => { setEditing(true); }}>
            Editar
          </button>
        </div>
      </header>
      <nav className="crm-tabs" aria-label="Perfil do cliente">
        {(
          [
            ['overview', 'Visão geral'],
            ['appointments', 'Agendamentos'],
            ['relationship', 'Relacionamento'],
            ['financial', 'Financeiro'],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-current={tab === value ? 'page' : undefined}
            key={value}
            type="button"
            onClick={() => { setTab(value); }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <div className="crm-overview-grid">
          <article className="app-card crm-highlight">
            <p className="ds-eyebrow">Próximo agendamento</p>
            {data.summary.nextAppointment === null ? (
              <EmptyState
                title="Nenhum próximo agendamento."
                description="Aproveite para organizar o próximo atendimento."
                action={<button onClick={schedule}>Agendar atendimento</button>}
              />
            ) : (
              <>
                <h3>{dateTime(data.summary.nextAppointment.startsAt)}</h3>
                <p>{data.summary.nextAppointment.serviceName}</p>
                <p>
                  {data.summary.nextAppointment.professionalName} ·{' '}
                  {data.summary.nextAppointment.unitName ?? 'Sem unidade'}
                </p>
              </>
            )}
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Relacionamento</p>
            <dl className="crm-stats">
              <div>
                <dt>Atendimentos</dt>
                <dd>{data.summary.completedCount}</dd>
              </div>
              <div>
                <dt>Cancelamentos</dt>
                <dd>{data.summary.canceledCount}</dd>
              </div>
              <div>
                <dt>Faltas</dt>
                <dd>{data.summary.noShowCount}</dd>
              </div>
            </dl>
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Último atendimento</p>
            {data.summary.lastCompleted === null ? (
              <p>Nenhum atendimento realizado ainda.</p>
            ) : (
              <>
                <h3>{dateTime(data.summary.lastCompleted.startsAt)}</h3>
                <p>
                  {data.summary.lastCompleted.serviceName} ·{' '}
                  {data.summary.lastCompleted.professionalName}
                </p>
                <p>Valor do serviço: {money(data.summary.lastCompleted.priceCents)}</p>
              </>
            )}
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Observações internas</p>
            <p>{customer.notes ?? 'Nenhuma observação interna cadastrada.'}</p>
            <button className="secondary-button" onClick={() => { setEditing(true); }}>
              Editar observações
            </button>
          </article>
          {(data.summary.recurringServices.length > 0 ||
            data.summary.recurringProfessionals.length > 0) && (
            <article className="app-card crm-recurring">
              <div>
                <h3>Serviços mais utilizados</h3>
                {data.summary.recurringServices.map((item) => (
                  <p key={item.publicId}>
                    <span>{item.name}</span>
                    <strong>{item.count}</strong>
                  </p>
                ))}
              </div>
              <div>
                <h3>Profissionais recorrentes</h3>
                {data.summary.recurringProfessionals.map((item) => (
                  <p key={item.publicId}>
                    <span>{item.name}</span>
                    <strong>{item.count}</strong>
                  </p>
                ))}
              </div>
            </article>
          )}
        </div>
      )}
      {tab === 'appointments' && (
        <div className="crm-timeline">
          {data.appointments.length === 0 ? (
            <EmptyState
              title="Nenhum atendimento realizado ainda."
              description="O histórico do cliente aparecerá aqui."
              action={<button onClick={schedule}>Agendar primeiro atendimento</button>}
            />
          ) : (
            data.appointments.map((appointment) => (
              <AppointmentCard appointment={appointment} key={appointment.publicId} />
            ))
          )}
        </div>
      )}
      {tab === 'relationship' && (
        <div className="crm-overview-grid">
          <article className="app-card">
            <h3>Observações internas</h3>
            <p>{customer.notes ?? 'Nenhuma observação interna cadastrada.'}</p>
            <small>Visível somente para a equipe autorizada do estabelecimento.</small>
          </article>
          {data.relationship.loyaltyBalances.some((item) => item.balance !== '0') && (
            <article className="app-card">
              <h3>Fidelidade</h3>
              {data.relationship.loyaltyBalances.map((item) => (
                <p key={item.type}>
                  {item.type === 'POINTS' ? 'Pontos' : 'Cashback'}:{' '}
                  <strong>{item.type === 'CASHBACK' ? money(item.balance) : item.balance}</strong>
                </p>
              ))}
            </article>
          )}
          {data.relationship.usedCoupons.length > 0 && (
            <article className="app-card">
              <h3>Cupons utilizados</h3>
              {data.relationship.usedCoupons.map((item) => (
                <p key={`${item.code}-${item.usedAt}`}>
                  <strong>{item.code}</strong>
                  <span>{date(item.usedAt)}</span>
                </p>
              ))}
            </article>
          )}
          {data.relationship.waitlist.length > 0 && (
            <article className="app-card">
              <h3>Lista de espera</h3>
              {data.relationship.waitlist.map((item) => (
                <p key={item.publicId}>
                  <strong>{item.serviceName}</strong>
                  <span>
                    {item.professionalName ?? 'Qualquer profissional'} · {item.preferredTimeStart}–
                    {item.preferredTimeEnd}
                  </span>
                </p>
              ))}
            </article>
          )}
        </div>
      )}
      {tab === 'financial' && (
        <div className="crm-overview-grid">
          <article className="app-card">
            <p className="ds-eyebrow">Pagamentos confirmados</p>
            <h3>{money(data.financial.paidTotalCents)}</h3>
            <p>
              {data.financial.paidCount} registro(s) pago(s). Valores agendados não entram neste
              total.
            </p>
          </article>
          <article className="app-card">
            <h3>Pagamentos recentes</h3>
            {data.financial.recentPayments.length === 0 ? (
              <p>Nenhum pagamento confirmado para este cliente.</p>
            ) : (
              data.financial.recentPayments.map((item) => (
                <p key={item.publicId}>
                  <span>
                    {date(item.createdAt)} · {item.kind === 'DEPOSIT' ? 'Sinal' : 'Pagamento'}
                  </span>
                  <strong>{money(item.amountCents)}</strong>
                </p>
              ))
            )}
          </article>
        </div>
      )}
      {editing && (
        <div
          className="app-drawer"
          role="dialog"
          aria-label={`Editar ${terminology.toLowerCase()}`}
        >
          <div className="drawer-header">
            <h3>Editar {terminology.toLowerCase()}</h3>
            <button className="secondary-button" onClick={() => { setEditing(false); }}>
              Fechar
            </button>
          </div>
          <CustomerForm
            customer={customer}
            fields={fields.data?.fields.filter((field) => field.scope === 'CUSTOMER') ?? []}
            busy={update.isPending}
            error={update.error instanceof Error ? 'Não foi possível salvar as alterações.' : null}
            terminology={terminology}
            onSave={(value) => update.mutateAsync(value).then(() => undefined)}
          />
        </div>
      )}
    </section>
  );
}
