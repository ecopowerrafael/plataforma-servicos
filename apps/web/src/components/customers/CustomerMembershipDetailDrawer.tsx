import {
  CustomerMembershipBenefitsBalanceResponseSchema,
  CustomerMembershipChargeListResponseSchema,
  CustomerMembershipPublicSchema,
  QrCodeResponseSchema,
  TenantPaymentOptionsOverviewSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { EmptyState, InlineAlert, ListSkeleton, StatusBadge } from '../ui/AppUi.js';
import './CustomerMembershipDetailDrawer.css';

const ActionResponseSchema = z.unknown();
const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('pt-BR') : '—';
const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pendente',
  PAUSED: 'Pausada',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
  PAID: 'Paga',
  FAILED: 'Falhou',
  REFUNDED: 'Reembolsada',
  PROCESSING: 'Processando',
  CANCELED_GATEWAY: 'Cancelada',
};
const statusTone = (status: string): 'green' | 'orange' | 'red' | 'blue' | 'gray' =>
  status === 'ACTIVE' || status === 'PAID'
    ? 'green'
    : status === 'PAST_DUE' || status === 'FAILED'
      ? 'red'
      : status === 'PENDING' || status === 'PROCESSING'
        ? 'orange'
        : status === 'PAUSED'
          ? 'blue'
          : 'gray';

interface Props {
  tenantPublicId: string;
  customerPublicId: string;
  customerName: string;
  customerEmail: string;
  membershipPublicId: string;
  priceCents: number;
  canManage: boolean;
  onClose: () => void;
}

export function CustomerMembershipDetailDrawer(props: Props) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const membership = useQuery({
    queryKey: ['tenant', props.tenantPublicId, 'customer-membership', props.customerPublicId],
    queryFn: () =>
      httpClient.request(
        `/tenant/customers/${props.customerPublicId}/membership?membershipPublicId=${props.membershipPublicId}`,
        {
          tenantPublicId: props.tenantPublicId,
          schema: CustomerMembershipPublicSchema,
        },
      ),
    retry: false,
  });
  const charges = useQuery({
    queryKey: [
      'tenant',
      props.tenantPublicId,
      'customer-membership-charges',
      props.membershipPublicId,
    ],
    queryFn: () =>
      httpClient.request(`/tenant/customer-memberships/${props.membershipPublicId}/charges`, {
        tenantPublicId: props.tenantPublicId,
        schema: CustomerMembershipChargeListResponseSchema,
      }),
    retry: false,
  });
  const benefits = useQuery({
    queryKey: [
      'tenant',
      props.tenantPublicId,
      'customer-membership-benefits',
      props.customerPublicId,
    ],
    queryFn: () =>
      httpClient.request(`/tenant/customers/${props.customerPublicId}/membership/benefits`, {
        tenantPublicId: props.tenantPublicId,
        schema: CustomerMembershipBenefitsBalanceResponseSchema,
      }),
    retry: false,
  });
  const options = useQuery({
    queryKey: ['tenant', props.tenantPublicId, 'payment-options'],
    queryFn: () =>
      httpClient.request('/tenant/payment-options', {
        tenantPublicId: props.tenantPublicId,
        schema: TenantPaymentOptionsOverviewSchema,
      }),
    enabled: props.canManage,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['tenant', props.tenantPublicId, 'customer-membership', props.customerPublicId],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          'tenant',
          props.tenantPublicId,
          'customer-membership-charges',
          props.membershipPublicId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          'tenant',
          props.tenantPublicId,
          'customer-membership-benefits',
          props.customerPublicId,
        ],
      }),
    ]);
  };
  const action = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: 'POST' | 'DELETE';
      body?: unknown;
    }) =>
      httpClient.request(path, {
        method,
        body,
        tenantPublicId: props.tenantPublicId,
        schema: ActionResponseSchema,
      }),
    onSuccess: async () => {
      setActionFeedback('Operação concluída.');
      await refresh();
    },
  });
  const current =
    charges.data?.items.find(
      (charge) => charge.status === 'PENDING' || charge.status === 'FAILED',
    ) ?? charges.data?.items[0];
  const gateway = current?.gatewayCharges[0];
  const generateProvider =
    options.data?.mercadoPago.active && options.data.mercadoPago.providerImplemented
      ? 'mercadopago'
      : options.data?.pixLocal.active
        ? 'pix-local'
        : null;
  const blocked = !props.canManage;
  const requestCancel = (atPeriodEnd: boolean) =>
    setConfirmation({
      title: atPeriodEnd ? 'Agendar cancelamento?' : 'Cancelar mensalidade agora?',
      description: atPeriodEnd
        ? 'A mensalidade ficará ativa até o fim do período atual.'
        : 'Esta ação encerra a mensalidade imediatamente e não altera o histórico financeiro.',
      confirmLabel: atPeriodEnd ? 'Agendar cancelamento' : 'Cancelar agora',
      requiresReason: true,
      variant: 'danger',
      onConfirm: async (reason) => {
        await action.mutateAsync({
          path: `/tenant/customer-memberships/${props.membershipPublicId}/${atPeriodEnd ? 'cancel-at-period-end' : 'cancel'}`,
          body: atPeriodEnd ? undefined : { reason },
        });
      },
    });
  return (
    <>
      <button className="membership-detail-backdrop" aria-label="Fechar" onClick={props.onClose} />
      <aside
        className="app-drawer membership-detail-drawer"
        role="dialog"
        aria-label="Detalhes da mensalidade"
      >
        <header className="membership-detail-header">
          <div>
            <span>Assinante</span>
            <h2>{props.customerName}</h2>
            <p>{props.customerEmail}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={props.onClose}>
            ×
          </button>
        </header>
        {membership.isPending ? (
          <ListSkeleton count={3} />
        ) : membership.error ? (
          <EmptyState
            title="Não foi possível carregar a mensalidade"
            description="Tente novamente."
            action={<button onClick={() => void membership.refetch()}>Tentar novamente</button>}
          />
        ) : membership.data ? (
          <div className="membership-detail-content">
            {blocked ? (
              <div className="membership-read-only-banner">
                Visualização histórica. Ações comerciais indisponíveis enquanto a venda de
                Membership estiver desabilitada.
              </div>
            ) : null}
            <section className="membership-detail-card membership-detail-summary">
              <div>
                <span>Plano de mensalidade</span>
                <strong>{membership.data.planName}</strong>
              </div>
              <div>
                <span>Status</span>
                <StatusBadge
                  status={statusLabels[membership.data.status].toLowerCase()}
                  tone={statusTone(membership.data.status)}
                />
              </div>
              <div>
                <span>Mensalidade</span>
                <strong>{money(membership.data.priceCents ?? props.priceCents)}</strong>
              </div>
              <div>
                <span>Período atual</span>
                <strong>
                  {date(membership.data.currentPeriodStart)} —{' '}
                  {date(membership.data.currentPeriodEnd)}
                </strong>
              </div>
              <div>
                <span>Próxima cobrança</span>
                <strong>{date(membership.data.nextBillingAt)}</strong>
              </div>
              {membership.data.cancelAtPeriodEnd || membership.data.canceledAt ? (
                <div>
                  <span>Cancelamento</span>
                  <strong>
                    {membership.data.canceledAt
                      ? dateTime(membership.data.canceledAt)
                      : 'Ao fim do período'}
                  </strong>
                </div>
              ) : null}
            </section>
            <section className="membership-detail-card">
              <div className="membership-detail-section-heading">
                <h3>Cobrança atual</h3>
                <span>{current ? statusLabels[current.status] : 'Nenhuma'}</span>
              </div>
              {current ? (
                <div className="membership-detail-grid">
                  <div>
                    <span>Valor</span>
                    <strong>{money(current.amountCents)}</strong>
                  </div>
                  <div>
                    <span>Período</span>
                    <strong>
                      {date(current.periodStart)} — {date(current.periodEnd)}
                    </strong>
                  </div>
                  <div>
                    <span>Vencimento</span>
                    <strong>{date(current.dueAt)}</strong>
                  </div>
                  <div>
                    <span>Pagamento</span>
                    <strong>{dateTime(current.paidAt)}</strong>
                  </div>
                </div>
              ) : (
                <p>Nenhuma cobrança encontrada.</p>
              )}
              {membership.data.status === 'PENDING' ? (
                <p className="membership-state-note">Aguardando pagamento da cobrança inicial.</p>
              ) : null}
              {membership.data.status === 'ACTIVE' ? (
                <p className="membership-state-note">Mensalidade ativa.</p>
              ) : null}
              {membership.data.status === 'PAST_DUE' ? (
                <p className="membership-state-note danger">
                  Mensalidade pendente; benefícios bloqueados até a regularização.
                </p>
              ) : null}
              {current && !blocked && current.status !== 'PAID' ? (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `/tenant/customer-membership-charges/${current.publicId}/payments/local/confirm`,
                    })
                  }
                >
                  Confirmar pagamento manual
                </button>
              ) : null}
              {generateProvider && current && !blocked && current.status !== 'PAID' ? (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `/tenant/customer-membership-charges/${current.publicId}/gateway-charges?provider=${generateProvider}`,
                    })
                  }
                >
                  Gerar cobrança {generateProvider === 'mercadopago' ? 'Gateway' : 'PIX'}
                </button>
              ) : null}
            </section>
            <section className="membership-detail-card">
              <div className="membership-detail-section-heading">
                <h3>Histórico de cobranças</h3>
                <span>{charges.data?.items.length ?? 0}</span>
              </div>
              {charges.isPending ? (
                <ListSkeleton count={2} />
              ) : (
                charges.data?.items.map((charge) => (
                  <article className="membership-charge-row" key={charge.publicId}>
                    <div>
                      <strong>{money(charge.amountCents)}</strong>
                      <span>
                        {date(charge.periodStart)} — {date(charge.periodEnd)}
                      </span>
                    </div>
                    <StatusBadge
                      status={statusLabels[charge.status].toLowerCase()}
                      tone={statusTone(charge.status)}
                    />
                    <div>
                      <span>
                        Pagamento:{' '}
                        {charge.payments[0]
                          ? `${charge.payments[0].paymentMethodName} · ${dateTime(charge.payments[0].paidAt)}`
                          : '—'}
                      </span>
                      <span>Gateway: {charge.gatewayCharges[0]?.provider ?? '—'}</span>
                    </div>
                    {charge.financialReversals.map((reversal) => (
                      <span className="membership-reversal" key={reversal.publicId}>
                        {reversal.type === 'CHARGEBACK' ? 'Chargeback' : 'Estorno'} ·{' '}
                        {money(reversal.amountCents)} · {dateTime(reversal.effectiveAt)}
                      </span>
                    ))}
                  </article>
                ))
              )}
            </section>
            <section className="membership-detail-card">
              <div className="membership-detail-section-heading">
                <h3>Benefícios e saldo</h3>
                <span>{benefits.data ? statusLabels[benefits.data.membershipStatus] : '—'}</span>
              </div>
              {benefits.error ? (
                <p>Saldo indisponível para este perfil.</p>
              ) : (
                benefits.data?.benefits.map((benefit) => (
                  <article className="membership-benefit-row" key={benefit.servicePublicId}>
                    <div>
                      <strong>{benefit.serviceName}</strong>
                      <span>
                        {benefit.type === 'UNLIMITED'
                          ? 'Ilimitado'
                          : benefit.discountPercent !== null
                            ? `${benefit.discountPercent}% de desconto`
                            : `${benefit.limit ?? 0} por ciclo`}
                      </span>
                    </div>
                    <div>
                      <span>Reservado</span>
                      <strong>{benefit.reserved ?? 0}</strong>
                      <span>Consumido</span>
                      <strong>{benefit.consumed ?? 0}</strong>
                      <span>Disponível</span>
                      <strong>{benefit.available ?? '—'}</strong>
                    </div>
                  </article>
                ))
              )}
            </section>
            <section className="membership-detail-card">
              <h3>Ações da mensalidade</h3>
              {action.error ? (
                <InlineAlert tone="danger" title="Não foi possível concluir a operação">
                  {action.error instanceof Error ? action.error.message : 'Tente novamente.'}
                </InlineAlert>
              ) : null}
              {qrError ? (
                <InlineAlert tone="danger" title="Não foi possível carregar o QR Code">
                  {qrError}
                </InlineAlert>
              ) : null}
              {actionFeedback ? <InlineAlert tone="info">{actionFeedback}</InlineAlert> : null}
              <div className="membership-detail-actions">
                {membership.data.cancelAtPeriodEnd ? (
                  <button
                    disabled={blocked || action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: `/tenant/customer-memberships/${props.membershipPublicId}/cancel-at-period-end`,
                        method: 'DELETE',
                      })
                    }
                  >
                    Desfazer cancelamento agendado
                  </button>
                ) : (
                  <>
                    <button
                      disabled={
                        blocked || action.isPending || membership.data.status === 'CANCELED'
                      }
                      onClick={() => requestCancel(true)}
                    >
                      Cancelar ao fim do período
                    </button>
                    <button
                      className="danger-outline-button"
                      disabled={
                        blocked || action.isPending || membership.data.status === 'CANCELED'
                      }
                      onClick={() => requestCancel(false)}
                    >
                      Cancelar agora
                    </button>
                  </>
                )}
                {gateway ? (
                  <>
                    <button
                      disabled={blocked || action.isPending}
                      onClick={() =>
                        action.mutate({
                          path: `/tenant/gateway-charges/${gateway.publicId}?refresh=true`,
                        })
                      }
                    >
                      Atualizar gateway
                    </button>
                    {gateway.pixCopyPaste ? (
                      <button
                        onClick={() => navigator.clipboard?.writeText(gateway.pixCopyPaste ?? '')}
                      >
                        Copiar PIX copia e cola
                      </button>
                    ) : null}
                    <button
                      disabled={blocked || action.isPending}
                      onClick={async () => {
                        setQrError(null);
                        try {
                          const result = await httpClient.request(
                            `/tenant/gateway-charges/${gateway.publicId}/pix-qrcode`,
                            { tenantPublicId: props.tenantPublicId, schema: QrCodeResponseSchema },
                          );
                          setQrCode(result.qrCodeDataUrl);
                        } catch (error) {
                          setQrError(error instanceof Error ? error.message : 'Tente novamente.');
                        }
                      }}
                    >
                      Exibir QR Code
                    </button>
                  </>
                ) : null}
              </div>
              {qrCode ? (
                <img className="membership-qr-code" src={qrCode} alt="QR Code para pagamento" />
              ) : null}
            </section>
          </div>
        ) : null}
      </aside>
      {confirmation ? (
        <ConfirmationDialog request={confirmation} onClose={() => setConfirmation(null)} />
      ) : null}
    </>
  );
}
