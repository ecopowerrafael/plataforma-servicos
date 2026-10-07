import {
  CustomerMembershipActionResponseSchema,
  CustomerMembershipAccountResponseSchema,
  CustomerMembershipAvailablePlanListResponseSchema,
  CustomerMembershipPublicSchema,
  CustomerMembershipPaymentResponseSchema,
} from '@plataforma/shared';
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCreditCard,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient } from '../../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../../ConfirmationDialog.js';

type CustomerMembershipAccountItem = NonNullable<
  z.infer<typeof CustomerMembershipAccountResponseSchema>['current']
>;
type CustomerMembershipPaymentResponse = z.infer<typeof CustomerMembershipPaymentResponseSchema>;

const STATUS_LABELS = {
  ACTIVE: 'Mensalidade ativa',
  PENDING: 'Aguardando pagamento',
  PAST_DUE: 'Mensalidade pendente',
  PAUSED: 'Mensalidade pausada',
  CANCELED: 'Mensalidade cancelada',
  EXPIRED: 'Mensalidade expirada',
} as const;

const CHARGE_LABELS = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada',
  REFUNDED: 'Estornada',
} as const;

const chargeLabel = (charge: CustomerMembershipAccountItem['charges'][number]) =>
  charge.financialEvent === 'CHARGEBACK' ? 'Pagamento contestado' : CHARGE_LABELS[charge.status];

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const date = (value: string | null) =>
  value === null ? 'Não informado' : new Date(value).toLocaleDateString('pt-BR');

const intervalLabel = (value: string) =>
  value === 'MONTHLY'
    ? 'por mês'
    : value === 'QUARTERLY'
      ? 'por trimestre'
      : value === 'ANNUAL'
        ? 'por ano'
        : 'por semestre';

export function CustomerMembershipPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const membership = useQuery({
    queryKey: ['public', slug, 'customer', 'membership'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership`, {
        schema: CustomerMembershipAccountResponseSchema,
      }),
    retry: false,
  });
  const payment = useQuery({
    queryKey: ['public', slug, 'customer', 'membership', 'payment'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership/payment`, {
        schema: CustomerMembershipPaymentResponseSchema,
      }),
    enabled:
      membership.data?.current?.status === 'PENDING' ||
      membership.data?.current?.status === 'PAST_DUE',
    retry: false,
  });
  const plans = useQuery({
    queryKey: ['public', slug, 'customer', 'membership', 'plans'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership/plans`, {
        schema: CustomerMembershipAvailablePlanListResponseSchema,
      }),
    enabled: membership.data?.current === null,
    retry: false,
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const createMembership = useMutation({
    mutationFn: async () => {
      if (selectedPlanId === null) throw new Error('Plano não selecionado.');
      return httpClient.request(`/public/sites/${slug}/customer/membership`, {
        method: 'POST',
        body: { planPublicId: selectedPlanId },
        schema: CustomerMembershipPublicSchema,
      });
    },
    onSuccess: async () => {
      setCreated(true);
      await queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'membership'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'membership', 'payment'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'membership', 'plans'],
      });
    },
  });
  const generateGateway = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership/payment/gateway`, {
        method: 'POST',
        body: {},
        schema: CustomerMembershipPaymentResponseSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['public', slug, 'customer', 'membership', 'payment'], data);
      await queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'membership'],
      });
    },
  });
  const refreshGateway = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership/payment/refresh`, {
        method: 'POST',
        body: {},
        schema: CustomerMembershipPaymentResponseSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['public', slug, 'customer', 'membership', 'payment'], data);
      await queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'membership'],
      });
    },
  });
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const membershipAction = useMutation({
    mutationFn: ({ path, method = 'POST' }: { path: string; method?: 'POST' | 'DELETE' }) =>
      httpClient.request(path, {
        method,
        ...(method === 'POST' ? { body: {} } : {}),
        schema: CustomerMembershipActionResponseSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['public', slug, 'customer', 'membership'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['public', slug, 'customer', 'membership', 'payment'],
        }),
      ]);
    },
  });

  if (membership.isPending)
    return (
      <section className="customer-section" aria-busy="true">
        <p className="customer-skeleton">Carregando sua mensalidade…</p>
      </section>
    );

  if (membership.error instanceof Error)
    return (
      <section className="customer-section" role="alert">
        <h1>Minha mensalidade</h1>
        <div className="customer-membership-error">
          <IconAlertCircle aria-hidden="true" size={22} />
          <p>Não foi possível carregar sua mensalidade.</p>
          <button
            className="public-primary-button"
            type="button"
            onClick={() => void membership.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );

  if (membership.data === undefined)
    return (
      <section className="customer-section" role="alert">
        <h1>Minha mensalidade</h1>
        <p>Não foi possível carregar sua mensalidade.</p>
      </section>
    );

  const data = membership.data;
  const current = data.current;
  const requestCancel = (atPeriodEnd: boolean) => {
    const isPastDue = current?.status === 'PAST_DUE';
    setConfirmation({
      title: atPeriodEnd ? 'Programar cancelamento?' : 'Cancelar mensalidade agora?',
      description: atPeriodEnd
        ? isPastDue
          ? 'Como sua mensalidade está pendente, o encerramento será processado pelo fluxo de cobrança. Novos benefícios já estão indisponíveis.'
          : current?.currentPeriodEnd
            ? `Você poderá usar os benefícios até ${date(current.currentPeriodEnd)}, conforme a disponibilidade do seu plano.`
            : 'O encerramento será processado pelo fluxo de cobrança da mensalidade.'
        : 'A mensalidade será encerrada agora. O histórico financeiro e os pagamentos já realizados serão preservados.',
      confirmLabel: atPeriodEnd ? 'Programar cancelamento' : 'Cancelar agora',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        await membershipAction.mutateAsync({
          path: `/public/sites/${slug}/customer/membership/${atPeriodEnd ? 'cancel-at-period-end' : 'cancel'}`,
        });
      },
    });
  };
  const requestUndo = () => {
    setConfirmation({
      title: 'Desfazer cancelamento programado?',
      description: 'A mensalidade continuará seguindo o ciclo atual do plano.',
      confirmLabel: 'Desfazer cancelamento',
      requiresReason: false,
      onConfirm: async () => {
        await membershipAction.mutateAsync({
          path: `/public/sites/${slug}/customer/membership/cancel-at-period-end`,
          method: 'DELETE',
        });
      },
    });
  };
  return (
    <section className="customer-section customer-membership-page">
      <header className="customer-membership-page__header">
        <div>
          <span className="customer-home-hero__eyebrow">
            <IconCreditCard aria-hidden="true" size={16} /> Área do cliente
          </span>
          <h1>Minha mensalidade</h1>
          <p>Consulte seu plano, benefícios e histórico.</p>
        </div>
      </header>

      {current === null ? (
        <MembershipCatalog
          plans={plans.data?.items ?? []}
          selectedPlanId={selectedPlanId}
          onSelect={setSelectedPlanId}
          pending={createMembership.isPending}
          error={createMembership.error}
          loading={plans.isPending}
          loadError={plans.error}
          onConfirm={() => createMembership.mutate()}
        />
      ) : (
        <MembershipCard
          membership={current}
          payment={payment.data}
          paymentError={payment.error}
          paymentLoading={payment.isPending}
          actionPending={generateGateway.isPending || refreshGateway.isPending}
          actionError={generateGateway.error ?? refreshGateway.error}
          onGenerate={() => generateGateway.mutate()}
          onRefresh={() => refreshGateway.mutate()}
          membershipActionPending={membershipAction.isPending}
          membershipActionError={membershipAction.error}
          onCancelNow={() => requestCancel(false)}
          onCancelAtPeriodEnd={() => requestCancel(true)}
          onUndoCancelAtPeriodEnd={requestUndo}
        />
      )}

      {created ? (
        <p className="customer-membership-notice" role="status">
          Mensalidade criada — conclua o pagamento.
        </p>
      ) : null}

      {data.history.length > 0 ? (
        <section className="customer-membership-card" aria-labelledby="customer-membership-history">
          <header>
            <div>
              <span>Registros anteriores</span>
              <h2 id="customer-membership-history">Histórico</h2>
            </div>
          </header>
          <div className="customer-membership-history">
            {data.history.map((item) => (
              <article key={item.publicId}>
                <div>
                  <strong>{item.planName}</strong>
                  <span>
                    {date(item.currentPeriodStart)} — {date(item.currentPeriodEnd)}
                  </span>
                </div>
                <div>
                  <span>
                    {money(item.priceCents)} {intervalLabel(item.billingInterval)}
                  </span>
                  <span
                    className={`customer-membership-status customer-membership-status--${item.status.toLowerCase()}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                {item.canceledAt !== null ? (
                  <span>Encerrada em {date(item.canceledAt)}</span>
                ) : null}
                <div className="customer-membership-history__charges">
                  {item.charges.map((charge, index) => (
                    <span key={`${item.publicId}-${charge.periodStart}-${index}`}>
                      {money(charge.amountCents)} · {chargeLabel(charge)} · vencimento{' '}
                      {date(charge.dueAt)}
                      {charge.paidAt !== null ? ` · pago em ${date(charge.paidAt)}` : ''}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {confirmation !== null ? (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            if (!membershipAction.isPending) setConfirmation(null);
          }}
        />
      ) : null}
    </section>
  );
}

function MembershipCatalog({
  plans,
  selectedPlanId,
  onSelect,
  pending,
  error,
  loading,
  loadError,
  onConfirm,
}: {
  plans: z.infer<typeof CustomerMembershipAvailablePlanListResponseSchema>['items'];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  pending: boolean;
  error: Error | null;
  loading: boolean;
  loadError: Error | null;
  onConfirm: () => void;
}) {
  const selected = plans.find((plan) => plan.publicId === selectedPlanId) ?? null;

  if (loading || loadError !== null)
    return (
      <div className="customer-membership-empty">
        <IconCreditCard aria-hidden="true" size={34} />
        <h2>Você ainda não possui uma mensalidade.</h2>
        <p>Quando houver uma mensalidade vinculada à sua conta, ela aparecerá aqui.</p>
      </div>
    );

  return (
    <section className="customer-membership-card" aria-labelledby="customer-membership-catalog">
      <header>
        <div>
          <span>Planos disponíveis</span>
          <h2 id="customer-membership-catalog">Escolha sua mensalidade</h2>
        </div>
      </header>
      {plans.length === 0 ? (
        <div className="customer-membership-empty">
          <IconCreditCard aria-hidden="true" size={34} />
          <p>No momento, não há planos disponíveis para adesão.</p>
        </div>
      ) : (
        <>
          <div className="customer-membership-benefits">
            {plans.map((plan) => (
              <article key={plan.publicId}>
                <div>
                  <strong>{plan.name}</strong>
                  {plan.description !== null ? <p>{plan.description}</p> : null}
                  <span>
                    {money(plan.priceCents)} {intervalLabel(plan.billingInterval)}
                  </span>
                </div>
                {plan.benefits.length > 0 ? (
                  <ul>
                    {plan.benefits.map((benefit) => (
                      <li key={`${plan.publicId}-${benefit.serviceName}`}>
                        {benefit.serviceName}:{' '}
                        {benefit.type === 'UNLIMITED'
                          ? 'Ilimitado'
                          : benefit.type === 'DISCOUNT'
                            ? `${benefit.discountPercent}% de desconto`
                            : `${benefit.quantityPerCycle} por ciclo`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  className="public-primary-button"
                  type="button"
                  aria-pressed={selectedPlanId === plan.publicId}
                  disabled={pending}
                  onClick={() => onSelect(plan.publicId)}
                >
                  {selectedPlanId === plan.publicId ? 'Plano selecionado' : 'Escolher plano'}
                </button>
              </article>
            ))}
          </div>
          {selected !== null ? (
            <div className="customer-membership-notice">
              <strong>Confirmar adesão: {selected.name}</strong>
              <p>
                {money(selected.priceCents)} {intervalLabel(selected.billingInterval)}. A primeira
                cobrança será criada agora e você poderá concluir o pagamento na sequência.
              </p>
              <button
                className="public-primary-button"
                type="button"
                disabled={pending}
                onClick={onConfirm}
              >
                {pending ? 'Criando mensalidade…' : 'Confirmar mensalidade'}
              </button>
            </div>
          ) : null}
          {error !== null ? (
            <p className="public-form-error" role="alert">
              Não foi possível criar sua mensalidade. Tente novamente.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function MembershipCard({
  membership,
  payment,
  paymentError,
  paymentLoading,
  actionPending,
  actionError,
  onGenerate,
  onRefresh,
  membershipActionPending,
  membershipActionError,
  onCancelNow,
  onCancelAtPeriodEnd,
  onUndoCancelAtPeriodEnd,
}: {
  membership: CustomerMembershipAccountItem;
  payment: CustomerMembershipPaymentResponse | undefined;
  paymentError: Error | null;
  paymentLoading: boolean;
  actionPending: boolean;
  actionError: Error | null;
  onGenerate: () => void;
  onRefresh: () => void;
  membershipActionPending: boolean;
  membershipActionError: Error | null;
  onCancelNow: () => void;
  onCancelAtPeriodEnd: () => void;
  onUndoCancelAtPeriodEnd: () => void;
}) {
  const charge = membership.charges[0] ?? null;
  const hasBenefits = membership.benefits.length > 0;
  return (
    <>
      <section
        className={`customer-membership-card customer-membership-card--${membership.status.toLowerCase()}`}
        aria-labelledby="customer-membership-status"
      >
        <header>
          <div>
            <span>Status atual</span>
            <h2 id="customer-membership-status">{STATUS_LABELS[membership.status]}</h2>
          </div>
          <span
            className={`customer-membership-status customer-membership-status--${membership.status.toLowerCase()}`}
          >
            {membership.status === 'ACTIVE' ? (
              <IconCheck aria-hidden="true" size={15} />
            ) : (
              <IconClock aria-hidden="true" size={15} />
            )}
            {STATUS_LABELS[membership.status]}
          </span>
        </header>
        <div className="customer-membership-plan-summary">
          <div>
            <span>Plano</span>
            <strong>{membership.planName}</strong>
            {membership.planDescription !== null ? <p>{membership.planDescription}</p> : null}
          </div>
          <div>
            <span>Valor</span>
            <strong>{money(membership.priceCents)}</strong>
            <small>{intervalLabel(membership.billingInterval)}</small>
          </div>
        </div>
        {membership.status === 'PAST_DUE' ? (
          <p className="customer-membership-notice customer-membership-notice--danger">
            Regularize sua mensalidade para voltar a utilizar novos benefícios. Agendamentos já
            reservados não são cancelados por este status.
          </p>
        ) : null}
        {membership.status === 'PENDING' ? (
          <p className="customer-membership-notice">
            A cobrança inicial está aguardando pagamento.
          </p>
        ) : null}
        {membership.cancelAtPeriodEnd ? (
          <p className="customer-membership-notice">
            {membership.status === 'PAST_DUE'
              ? 'Cancelamento programado para processamento pela cobrança pendente.'
              : membership.currentPeriodEnd
                ? `Cancelamento programado para ${date(membership.currentPeriodEnd)}.`
                : 'Cancelamento programado para o fim do ciclo atual.'}
          </p>
        ) : null}
        <dl className="customer-membership-facts">
          <div>
            <dt>
              <IconCalendarEvent aria-hidden="true" size={15} /> Período atual
            </dt>
            <dd>
              {date(membership.currentPeriodStart)} — {date(membership.currentPeriodEnd)}
            </dd>
          </div>
          <div>
            <dt>Próxima cobrança</dt>
            <dd>{date(membership.nextBillingAt)}</dd>
          </div>
        </dl>
      </section>

      {['ACTIVE', 'PENDING', 'PAST_DUE', 'PAUSED'].includes(membership.status) ? (
        <section className="customer-membership-card customer-membership-management">
          <header>
            <div>
              <span>Gerenciar mensalidade</span>
              <h2>Ações da sua mensalidade</h2>
            </div>
          </header>
          {membershipActionError !== null ? (
            <p className="public-form-error" role="alert">
              {membershipActionError.message.includes('RESERVED_MEMBERSHIP_USAGE') ||
              membershipActionError.message.includes('OPEN_MEMBERSHIP_APPOINTMENTS')
                ? 'Não é possível cancelar enquanto houver uma reserva ou agendamento usando este benefício.'
                : 'Não foi possível atualizar o cancelamento. Tente novamente.'}
            </p>
          ) : null}
          {membership.cancelAtPeriodEnd ? (
            <button
              type="button"
              disabled={membershipActionPending}
              onClick={onUndoCancelAtPeriodEnd}
            >
              {membershipActionPending ? 'Atualizando…' : 'Desfazer cancelamento'}
            </button>
          ) : (
            <div className="customer-membership-management__actions">
              {membership.status === 'ACTIVE' || membership.status === 'PAST_DUE' ? (
                <button
                  type="button"
                  disabled={membershipActionPending}
                  onClick={onCancelAtPeriodEnd}
                >
                  {membership.status === 'PAST_DUE'
                    ? 'Programar encerramento'
                    : 'Cancelar ao fim do período'}
                </button>
              ) : null}
              <button
                type="button"
                className="danger-outline-button"
                disabled={membershipActionPending}
                onClick={onCancelNow}
              >
                {membershipActionPending ? 'Atualizando…' : 'Cancelar agora'}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {charge !== null ? (
        <section className="customer-membership-card" aria-labelledby="customer-membership-charge">
          <header>
            <div>
              <span>{membership.status === 'ACTIVE' ? 'Próxima cobrança' : 'Cobrança atual'}</span>
              <h2 id="customer-membership-charge">{chargeLabel(charge)}</h2>
            </div>
            <strong>{money(charge.amountCents)}</strong>
          </header>
          <dl className="customer-membership-facts">
            <div>
              <dt>Vencimento</dt>
              <dd>{date(charge.dueAt)}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{date(charge.paidAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {membership.status === 'PENDING' || membership.status === 'PAST_DUE' ? (
        <MembershipPaymentCard
          payment={payment}
          loading={paymentLoading}
          error={paymentError ?? actionError}
          actionPending={actionPending}
          actionLabel={
            membership.status === 'PAST_DUE' ? 'Regularizar mensalidade' : 'Realizar pagamento'
          }
          onGenerate={onGenerate}
          onRefresh={onRefresh}
        />
      ) : null}

      <section className="customer-membership-card" aria-labelledby="customer-membership-benefits">
        <header>
          <div>
            <span>O que está incluído</span>
            <h2 id="customer-membership-benefits">Seus benefícios</h2>
          </div>
        </header>
        {membership.status === 'PAST_DUE' || !membership.benefitsAvailable ? (
          <p className="customer-membership-notice">
            Os novos benefícios estão temporariamente indisponíveis neste status.
          </p>
        ) : !hasBenefits ? (
          <p className="customer-membership-notice">Nenhum benefício disponível neste ciclo.</p>
        ) : (
          <div className="customer-membership-benefits">
            {membership.benefits.map((benefit) => (
              <article key={benefit.serviceName}>
                <div>
                  <strong>{benefit.serviceName}</strong>
                  {benefit.type === 'UNLIMITED' ? (
                    <span>Ilimitado</span>
                  ) : benefit.type === 'DISCOUNT' ? (
                    <span>{benefit.discountPercent}% de desconto</span>
                  ) : (
                    <span>{benefit.limit} por ciclo</span>
                  )}
                </div>
                {benefit.type === 'QUANTITY' ? (
                  <div>
                    <span>{benefit.consumed} consumido(s)</span>
                    <span>{benefit.reserved} reservado(s)</span>
                    <strong>{benefit.available} disponível(is)</strong>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MembershipPaymentCard({
  payment,
  loading,
  error,
  actionPending,
  actionLabel,
  onGenerate,
  onRefresh,
}: {
  payment: CustomerMembershipPaymentResponse | undefined;
  loading: boolean;
  error: Error | null;
  actionPending: boolean;
  actionLabel: string;
  onGenerate: () => void;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const gateway = payment?.gateway ?? null;
  const canGenerate = payment?.canGenerateGatewayCharge ?? false;
  const canRefresh = payment?.canRefreshGatewayCharge ?? false;

  const copyPix = async () => {
    if (gateway?.pixCopyPaste === null || gateway?.pixCopyPaste === undefined) return;
    await navigator.clipboard.writeText(gateway.pixCopyPaste);
    setCopied(true);
  };

  return (
    <section className="customer-membership-card" aria-labelledby="customer-membership-payment">
      <header>
        <div>
          <span>Pagamento</span>
          <h2 id="customer-membership-payment">Regularize sua mensalidade</h2>
        </div>
        {payment?.charge === null || payment?.charge === undefined ? null : (
          <strong>{money(payment.charge.amountCents)}</strong>
        )}
      </header>
      {loading ? <p className="customer-skeleton">Carregando pagamento…</p> : null}
      {error !== null ? (
        <p className="public-form-error" role="alert">
          Não foi possível carregar ou atualizar o pagamento.
        </p>
      ) : null}
      {gateway?.pixCopyPaste !== null && gateway?.pixCopyPaste !== undefined ? (
        <div>
          <p>PIX copia e cola</p>
          <textarea readOnly value={gateway.pixCopyPaste} aria-label="PIX copia e cola" />
          <button type="button" disabled={actionPending} onClick={() => void copyPix()}>
            {copied ? 'Copiado' : 'Copiar código PIX'}
          </button>
          {canRefresh ? (
            <button type="button" disabled={actionPending} onClick={onRefresh}>
              {actionPending ? 'Atualizando…' : 'Atualizar pagamento'}
            </button>
          ) : null}
        </div>
      ) : canGenerate ? (
        <button type="button" disabled={actionPending} onClick={onGenerate}>
          {actionPending ? 'Gerando pagamento…' : actionLabel}
        </button>
      ) : null}
    </section>
  );
}
