import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';

interface PaymentModalProps {
  tenantPublicId: string;
  tenantName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const previewSchema = z.object({
  tenant: z.object({
    publicId: z.string(),
    name: z.string(),
  }),
  plan: z.object({
    publicId: z.string(),
    name: z.string(),
    priceInCents: z.number(),
  }).nullable(),
  amountCents: z.number(),
  availableBalanceCents: z.number(),
  balanceAfterCents: z.number(),
  canPay: z.boolean(),
  subscriptionStatus: z.string(),
  nextPeriod: z.object({
    start: z.string(),
    end: z.string(),
  }).nullable(),
});

export function PaymentModal({ tenantPublicId, tenantName, onClose, onSuccess }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);

  const preview = useQuery({
    queryKey: ['payment-preview', tenantPublicId],
    queryFn: () =>
      httpClient.request(`/commercial/clients/${tenantPublicId}/payment-preview`, {
        schema: previewSchema,
      }),
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      setLoading(true);
      return httpClient.request(`/commercial/clients/${tenantPublicId}/mark-paid`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setLoading(false);
      onSuccess();
      onClose();
    },
    onError: () => {
      setLoading(false);
    },
  });

  if (preview.isPending) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Carregando...</div>
        </div>
      </div>
    );
  }

  const data = preview.data;
  if (!data || !data.plan) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>Erro ao carregar dados</h2>
          <button onClick={onClose}>Fechar</button>
        </div>
      </div>
    );
  }

  const formattedAmount = (data.amountCents / 100).toFixed(2);
  const formattedBalance = (data.availableBalanceCents / 100).toFixed(2);
  const formattedBalanceAfter = (data.balanceAfterCents / 100).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Marcar Como Pago</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="info-section">
            <h3>Cliente: {tenantName}</h3>
            <p className="text-secondary">{data.tenant.publicId}</p>
          </div>

          <div className="payment-info">
            <div className="info-row">
              <span className="label">Plano:</span>
              <span className="value">{data.plan.name}</span>
            </div>
            <div className="info-row">
              <span className="label">Valor:</span>
              <span className="value">R$ {formattedAmount}</span>
            </div>
          </div>

          <div className="wallet-info">
            <h4>Carteira</h4>
            <div className="info-row">
              <span className="label">Saldo Disponível:</span>
              <span className="value">R$ {formattedBalance}</span>
            </div>
            <div className="info-row">
              <span className="label">Saldo Após Pagamento:</span>
              <span className={`value ${data.canPay ? 'positive' : 'negative'}`}>
                R$ {formattedBalanceAfter}
              </span>
            </div>
          </div>

          {!data.canPay && (
            <div className="error-message">
              ⚠️ Saldo insuficiente na carteira para este pagamento
            </div>
          )}

          {data.nextPeriod && (
            <div className="period-info">
              <p className="text-secondary">
                Próximo período: {new Date(data.nextPeriod.start).toLocaleDateString('pt-BR')} até{' '}
                {new Date(data.nextPeriod.end).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={() => paymentMutation.mutate()}
            disabled={!data.canPay || loading}
          >
            {loading ? 'Processando...' : 'Confirmar Pagamento'}
          </button>
        </div>

        {paymentMutation.error && (
          <div className="error-message">
            Erro ao processar pagamento. Tente novamente.
          </div>
        )}

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background: var(--bg-primary);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            width: 90%;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 20px;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--text-secondary);
          }

          .modal-body {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .info-section {
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 8px;
          }

          .info-section h3 {
            margin: 0 0 8px 0;
            font-size: 16px;
          }

          .text-secondary {
            color: var(--text-secondary);
            font-size: 12px;
            margin: 0;
          }

          .payment-info, .wallet-info {
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 8px;
          }

          .wallet-info h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
          }

          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--border-color);
          }

          .info-row:last-child {
            border-bottom: none;
          }

          .label {
            color: var(--text-secondary);
            font-size: 13px;
          }

          .value {
            font-weight: 600;
            font-size: 14px;
          }

          .value.positive {
            color: rgb(34, 197, 94);
          }

          .value.negative {
            color: rgb(239, 68, 68);
          }

          .error-message {
            padding: 12px;
            background: rgba(239, 68, 68, 0.1);
            color: rgb(239, 68, 68);
            border-radius: 8px;
            font-size: 13px;
          }

          .period-info {
            padding: 8px 0;
          }

          .modal-footer {
            padding: 20px;
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
            justify-content: flex-end;
          }

          .btn-primary, .btn-secondary {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-primary {
            background: var(--primary);
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: var(--bg-secondary);
            color: var(--text-primary);
          }

          .btn-secondary:hover:not(:disabled) {
            background: var(--border-color);
          }

          .btn-secondary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .loading {
            padding: 20px;
            text-align: center;
          }
        `}</style>
      </div>
    </div>
  );
}
