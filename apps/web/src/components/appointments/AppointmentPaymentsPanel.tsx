import {
  AppointmentPaymentsResponseSchema,
  CouponRedemptionListResponseSchema,
  CouponRedemptionPublicSchema,
  LoyaltyLedgerEntryPublicSchema,
  LoyaltyLedgerListResponseSchema,
  PaymentMethodListResponseSchema,
  ReceiptPublicSchema,
  type ReceiptPublic,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const kindLabels: Record<string, string> = {
  PAYMENT: 'Pagamento',
  DEPOSIT: 'Sinal',
};

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;

export function AppointmentPaymentsPanel({
  tenantPublicId,
  appointmentPublicId,
  canRead,
  canManage,
}: {
  tenantPublicId: string;
  appointmentPublicId: string;
  canRead: boolean;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [paymentMethodPublicId, setPaymentMethodPublicId] = useState('');
  const [kind, setKind] = useState<'PAYMENT' | 'DEPOSIT'>('PAYMENT');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<ReceiptPublic | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [loyaltyType, setLoyaltyType] = useState<'POINTS' | 'CASHBACK'>('POINTS');
  const [loyaltyAmount, setLoyaltyAmount] = useState('');

  const paymentsQueryKey = [
    'tenant',
    tenantPublicId,
    'appointment',
    appointmentPublicId,
    'payments',
  ];
  const couponsQueryKey = ['tenant', tenantPublicId, 'appointment', appointmentPublicId, 'coupons'];
  const loyaltyQueryKey = ['tenant', tenantPublicId, 'appointment', appointmentPublicId, 'loyalty'];

  const paymentMethods = useQuery({
    queryKey: ['tenant', tenantPublicId, 'payment-methods'],
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    enabled: canManage,
    retry: false,
  });
  const activeMethods = paymentMethods.data?.items.filter((item) => item.active) ?? [];
  const selectedPaymentMethodPublicId =
    paymentMethodPublicId === '' ? (activeMethods[0]?.publicId ?? '') : paymentMethodPublicId;

  const payments = useQuery({
    queryKey: paymentsQueryKey,
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/payments`, {
        schema: AppointmentPaymentsResponseSchema,
        tenantPublicId,
      }),
    enabled: canRead,
    retry: false,
  });

  const register = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/payments`, {
        method: 'POST',
        body: {
          paymentMethodPublicId: selectedPaymentMethodPublicId,
          kind,
          amountCents: Math.round(Number(amount.replace(',', '.')) * 100),
          notes: notes === '' ? null : notes,
        },
        schema: AppointmentPaymentsResponseSchema.shape.items.element,
        tenantPublicId,
      }),
    onSuccess: () => {
      setAmount('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: paymentsQueryKey });
    },
  });

  const cancel = useMutation({
    mutationFn: (paymentPublicId: string) => {
      const reason = window.prompt('Motivo do cancelamento do pagamento:');
      if (reason === null || reason.trim().length < 3)
        throw new Error('Informe um motivo com pelo menos 3 caracteres.');
      return httpClient.request(
        `/tenant/appointments/${appointmentPublicId}/payments/${paymentPublicId}/cancel`,
        {
          method: 'POST',
          body: { reason },
          schema: AppointmentPaymentsResponseSchema.shape.items.element,
          tenantPublicId,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentsQueryKey });
    },
  });

  const coupons = useQuery({
    queryKey: couponsQueryKey,
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/coupons`, {
        schema: CouponRedemptionListResponseSchema,
        tenantPublicId,
      }),
    enabled: canRead,
    retry: false,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: paymentsQueryKey });
    void queryClient.invalidateQueries({ queryKey: couponsQueryKey });
    void queryClient.invalidateQueries({ queryKey: loyaltyQueryKey });
  };

  const redeemCoupon = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/coupons`, {
        method: 'POST',
        body: { code: couponCode },
        schema: CouponRedemptionPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setCouponCode('');
      invalidateAll();
    },
  });

  const cancelCoupon = useMutation({
    mutationFn: (redemptionPublicId: string) => {
      const reason = window.prompt('Motivo do cancelamento do cupom:');
      if (reason === null || reason.trim().length < 3)
        throw new Error('Informe um motivo com pelo menos 3 caracteres.');
      return httpClient.request(
        `/tenant/appointments/${appointmentPublicId}/coupons/${redemptionPublicId}/cancel`,
        { method: 'POST', body: { reason }, schema: CouponRedemptionPublicSchema, tenantPublicId },
      );
    },
    onSuccess: invalidateAll,
  });

  const loyalty = useQuery({
    queryKey: loyaltyQueryKey,
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/loyalty`, {
        schema: LoyaltyLedgerListResponseSchema,
        tenantPublicId,
      }),
    enabled: canRead,
    retry: false,
  });

  const redeemLoyalty = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/loyalty`, {
        method: 'POST',
        body: { type: loyaltyType, amount: Number(loyaltyAmount) },
        schema: LoyaltyLedgerEntryPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setLoyaltyAmount('');
      invalidateAll();
    },
  });

  const cancelLoyalty = useMutation({
    mutationFn: (entryPublicId: string) => {
      const reason = window.prompt('Motivo do cancelamento do resgate:');
      if (reason === null || reason.trim().length < 3)
        throw new Error('Informe um motivo com pelo menos 3 caracteres.');
      return httpClient.request(
        `/tenant/appointments/${appointmentPublicId}/loyalty/${entryPublicId}/cancel`,
        {
          method: 'POST',
          body: { reason },
          schema: LoyaltyLedgerEntryPublicSchema,
          tenantPublicId,
        },
      );
    },
    onSuccess: invalidateAll,
  });

  const viewReceipt = useMutation({
    mutationFn: (paymentPublicId: string) =>
      httpClient.request(
        `/tenant/appointments/${appointmentPublicId}/payments/${paymentPublicId}/receipt`,
        { schema: ReceiptPublicSchema, tenantPublicId },
      ),
    onSuccess: (data) => {
      setReceipt(data);
    },
  });

  if (!canRead) return null;

  return (
    <section aria-label="Pagamentos">
      <h4>Pagamentos</h4>
      {payments.isPending ? <p>Carregando pagamentos…</p> : null}
      {payments.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os pagamentos.</p>
      ) : null}
      {payments.data !== undefined && (
        <>
          <p>
            {`Preço: ${formatMoney(payments.data.summary.priceCents)} — Pago: ${formatMoney(payments.data.summary.totalPaidCents)} — Saldo: ${formatMoney(payments.data.summary.balanceCents)}`}
          </p>
          {payments.data.summary.couponDiscountCents !== '0' && (
            <p>{`Desconto de cupom: ${formatMoney(payments.data.summary.couponDiscountCents)}`}</p>
          )}
          {payments.data.summary.loyaltyDiscountCents !== '0' && (
            <p>{`Desconto de fidelidade: ${formatMoney(payments.data.summary.loyaltyDiscountCents)}`}</p>
          )}
          {payments.data.summary.depositType !== null && (
            <p>
              {`Sinal configurado: ${
                payments.data.summary.depositType === 'PERCENTAGE'
                  ? `${String(payments.data.summary.depositPercentage)}%`
                  : 'valor fixo'
              } (${formatMoney(payments.data.summary.depositAmountCents ?? '0')}) — pago: ${formatMoney(payments.data.summary.depositPaidCents)}`}
            </p>
          )}
          <ul>
            {payments.data.items.map((item) => (
              <li key={item.publicId}>
                {`[${kindLabels[item.kind] ?? item.kind}] ${item.paymentMethodName} — ${formatMoney(item.amountCents)} — ${item.status === 'PAID' ? 'Pago' : 'Cancelado'}`}
                {item.status === 'PAID' && (
                  <button
                    type="button"
                    disabled={viewReceipt.isPending}
                    onClick={() => {
                      viewReceipt.mutate(item.publicId);
                    }}
                  >
                    Recibo
                  </button>
                )}
                {item.status === 'PAID' && canManage && (
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => {
                      cancel.mutate(item.publicId);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </li>
            ))}
            {payments.data.items.length === 0 && <li>Nenhum pagamento registrado.</li>}
          </ul>
          {cancel.error instanceof Error ? (
            <p className="form-error">{cancel.error.message}</p>
          ) : null}
          {viewReceipt.error instanceof Error ? (
            <p className="form-error">{viewReceipt.error.message}</p>
          ) : null}
          {receipt !== null && (
            <div className="printable-receipt">
              <h4>{receipt.tenantDisplayName}</h4>
              <p>{receipt.tenantLegalName}</p>
              <p>{`Recibo ${receipt.number} — ${new Date(receipt.issuedAt).toLocaleString('pt-BR')}`}</p>
              <p>{`Cliente: ${receipt.customerName}`}</p>
              <p>{`Agendamento: ${receipt.appointmentProtocol} — ${receipt.serviceName}`}</p>
              <p>{`Forma de pagamento: ${receipt.paymentMethodName}`}</p>
              <p>{`${kindLabels[receipt.paymentKind] ?? receipt.paymentKind}: ${formatMoney(receipt.amountCents)}`}</p>
              <p>{`Data do pagamento: ${new Date(receipt.paymentCreatedAt).toLocaleString('pt-BR')}`}</p>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                >
                  Imprimir / baixar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReceipt(null);
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {coupons.data !== undefined && coupons.data.items.length > 0 && (
        <ul>
          {coupons.data.items.map((item) => (
            <li key={item.publicId}>
              {`Cupom ${item.couponCode} — desconto ${formatMoney(item.discountAmountCents)}${item.canceledAt === null ? '' : ' (cancelado)'}`}
              {item.canceledAt === null && canManage && (
                <button
                  type="button"
                  disabled={cancelCoupon.isPending}
                  onClick={() => {
                    cancelCoupon.mutate(item.publicId);
                  }}
                >
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="form-actions">
          <input
            placeholder="Código do cupom"
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={redeemCoupon.isPending || couponCode.trim() === ''}
            onClick={() => {
              redeemCoupon.mutate();
            }}
          >
            Aplicar cupom
          </button>
          {redeemCoupon.error instanceof Error ? (
            <p className="form-error">{redeemCoupon.error.message}</p>
          ) : null}
        </div>
      )}
      {loyalty.data !== undefined && loyalty.data.items.length > 0 && (
        <ul>
          {loyalty.data.items.map((item) => (
            <li key={item.publicId}>
              {`${item.reason === 'REDEEMED' ? 'Resgate' : item.reason} ${item.type === 'CASHBACK' ? 'cashback' : 'pontos'}: ${item.amount}${item.discountCentsApplied === null ? '' : ` — desconto ${formatMoney(item.discountCentsApplied)}`}`}
              {item.reason === 'REDEEMED' && item.discountCentsApplied !== null && canManage && (
                <button
                  type="button"
                  disabled={cancelLoyalty.isPending}
                  onClick={() => {
                    cancelLoyalty.mutate(item.publicId);
                  }}
                >
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="form-actions">
          <select
            value={loyaltyType}
            onChange={(event) => {
              setLoyaltyType(event.target.value as 'POINTS' | 'CASHBACK');
            }}
          >
            <option value="POINTS">Pontos</option>
            <option value="CASHBACK">Cashback</option>
          </select>
          <input
            type="number"
            min="1"
            placeholder="Quantidade a resgatar"
            value={loyaltyAmount}
            onChange={(event) => {
              setLoyaltyAmount(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={redeemLoyalty.isPending || loyaltyAmount.trim() === ''}
            onClick={() => {
              redeemLoyalty.mutate();
            }}
          >
            Resgatar fidelidade
          </button>
          {redeemLoyalty.error instanceof Error ? (
            <p className="form-error">{redeemLoyalty.error.message}</p>
          ) : null}
        </div>
      )}
      {canManage && (
        <div className="form-actions">
          <select
            value={selectedPaymentMethodPublicId}
            onChange={(event) => {
              setPaymentMethodPublicId(event.target.value);
            }}
          >
            {activeMethods.map((methodItem) => (
              <option key={methodItem.publicId} value={methodItem.publicId}>
                {methodItem.name}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as 'PAYMENT' | 'DEPOSIT');
            }}
          >
            <option value="PAYMENT">Pagamento</option>
            <option value="DEPOSIT">Sinal</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor (R$)"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <input
            placeholder="Observação (opcional)"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={register.isPending || amount === '' || selectedPaymentMethodPublicId === ''}
            onClick={() => {
              register.mutate();
            }}
          >
            Registrar pagamento
          </button>
          {register.error instanceof Error ? (
            <p className="form-error">{register.error.message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
