import { PaymentMethodListResponseSchema, PaymentPublicSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { formatMoneyCents } from './agenda-overview.js';
import { httpClient } from '../../lib/http.js';

export interface AgendaCompleteTarget {
  publicId: string;
  customerName: string;
  balanceCents: number;
}

/**
 * Conclusão do atendimento com resolução financeira em um passo: registra o recebimento
 * pelas formas de pagamento reais do estabelecimento ou mantém o saldo em aberto.
 * Nunca marca cobrança online como confirmada — isso continua vindo do gateway.
 */
export function AgendaCompleteDialog({
  tenantPublicId,
  target,
  canManagePayments,
  onClose,
  onCompleted,
}: {
  tenantPublicId: string;
  target: AgendaCompleteTarget;
  canManagePayments: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [receiveNow, setReceiveNow] = useState(canManagePayments);
  const [paymentMethodPublicId, setPaymentMethodPublicId] = useState('');
  const [amount, setAmount] = useState((target.balanceCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const paymentMethods = useQuery({
    queryKey: ['tenant', tenantPublicId, 'payment-methods'],
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    enabled: canManagePayments,
    retry: false,
  });
  const activeMethods = paymentMethods.data?.items.filter((item) => item.active) ?? [];
  const selectedMethod =
    paymentMethodPublicId === '' ? (activeMethods[0]?.publicId ?? '') : paymentMethodPublicId;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (receiveNow) {
        if (selectedMethod === '') throw new Error('Cadastre uma forma de pagamento ativa.');
        const amountCents = Math.round(Number(amount.replace(',', '.')) * 100);
        if (!Number.isFinite(amountCents) || amountCents <= 0)
          throw new Error('Informe um valor de recebimento válido.');
        await httpClient.request(`/tenant/appointments/${target.publicId}/payments`, {
          method: 'POST',
          body: { paymentMethodPublicId: selectedMethod, kind: 'PAYMENT', amountCents },
          schema: PaymentPublicSchema,
          tenantPublicId,
        });
      }
      onCompleted();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível concluir o atendimento.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="agenda-complete">
        <h3 id="agenda-complete">Concluir atendimento</h3>
        <p>
          {target.customerName} · saldo em aberto de {formatMoneyCents(target.balanceCents)}.
        </p>
        {canManagePayments ? (
          <fieldset className="ds-form-section">
            <legend>Pagamento</legend>
            <label className="agenda-radio">
              <input
                type="radio"
                name="agenda-complete-payment"
                checked={receiveNow}
                onChange={() => {
                  setReceiveNow(true);
                }}
              />
              <span>Recebido agora</span>
            </label>
            <label className="agenda-radio">
              <input
                type="radio"
                name="agenda-complete-payment"
                checked={!receiveNow}
                onChange={() => {
                  setReceiveNow(false);
                }}
              />
              <span>Permanecer pendente</span>
            </label>
            {receiveNow && (
              <>
                <label>
                  Forma de pagamento
                  <select
                    value={selectedMethod}
                    onChange={(event) => {
                      setPaymentMethodPublicId(event.target.value);
                    }}
                  >
                    {activeMethods.map((method) => (
                      <option value={method.publicId} key={method.publicId}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor recebido
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                    }}
                  />
                </label>
              </>
            )}
          </fieldset>
        ) : (
          <p className="form-notice">
            O atendimento será concluído com o pagamento em aberto — você não tem permissão para
            registrar recebimentos.
          </p>
        )}
        {error !== null && <p className="form-error">{error}</p>}
        <div className="ds-form-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            Concluir atendimento
          </button>
        </div>
      </div>
    </div>
  );
}
