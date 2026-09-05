import { type TreatmentPlanPublic, UpdateTreatmentPlanRequestSchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import { formatMoneyCents } from '../customers/customer-crm.js';

type BillingMode = 'TOTAL' | 'PER_SESSION';

export function TreatmentPlanEditDialog({
  plan,
  onClose,
  onSuccess,
  allowedFields,
}: {
  plan: TreatmentPlanPublic;
  onClose: () => void;
  onSuccess: () => void;
  allowedFields?: ('title' | 'billingMode' | 'amount' | 'sessions' | 'interval' | 'notes')[];
}) {
  const [title, setTitle] = useState(plan.title);
  const [billingMode, setBillingMode] = useState<BillingMode>(plan.billingMode as BillingMode);
  const [amount, setAmount] = useState(plan.amountCents / 100);
  const [sessionsPlanned, setSessionsPlanned] = useState(plan.sessionsPlanned ?? 0);
  const [returnIntervalDays, setReturnIntervalDays] = useState(plan.returnIntervalDays ?? 0);
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canEditTitle = !allowedFields || allowedFields.includes('title');
  const canEditBilling = !allowedFields || allowedFields.includes('billingMode');
  const canEditAmount = !allowedFields || allowedFields.includes('amount');
  const canEditSessions = !allowedFields || allowedFields.includes('sessions');
  const canEditInterval = !allowedFields || allowedFields.includes('interval');
  const canEditNotes = !allowedFields || allowedFields.includes('notes');

  const estimatedTotal =
    billingMode === 'PER_SESSION' && sessionsPlanned ? amount * sessionsPlanned : amount;

  const perSessionValue =
    billingMode === 'TOTAL' && sessionsPlanned && sessionsPlanned > 0
      ? amount / sessionsPlanned
      : amount;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const result = await httpClient.request(`/tenant/treatment-plans/${plan.publicId}`, {
        method: 'PATCH',
        body: {
          title,
          amountCents: Math.round(amount * 100),
          sessionsPlanned: sessionsPlanned || null,
          returnIntervalDays: returnIntervalDays || null,
          notes: notes || null,
          billingMode,
        },
        schema: UpdateTreatmentPlanRequestSchema,
      });
      return result;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      setErrorMsg(error?.message || 'Erro ao atualizar orçamento');
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar orçamento</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {canEditTitle && (
            <div className="form-group">
              <label>Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do orçamento"
                disabled={updateMutation.isPending}
              />
            </div>
          )}

          {canEditBilling && (
            <div className="form-group">
              <label>Forma de cobrança</label>
              <select
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value as BillingMode)}
                disabled={updateMutation.isPending}
              >
                <option value="PER_SESSION">Valor por sessão</option>
                <option value="TOTAL">Valor total do plano</option>
              </select>
              <p className="form-hint">
                {billingMode === 'PER_SESSION'
                  ? 'Cada sessão tem valor fixo'
                  : 'Valor total independente de sessões'}
              </p>
            </div>
          )}

          {canEditAmount && (
            <>
              <div className="form-group">
                <label>
                  {billingMode === 'PER_SESSION'
                    ? 'Valor por sessão (R$)'
                    : 'Valor total do plano (R$)'}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  step="0.01"
                  disabled={updateMutation.isPending}
                />
              </div>

              {billingMode === 'PER_SESSION' && sessionsPlanned > 0 && (
                <div className="form-info-inline">
                  <span>Valor total estimado:</span>
                  <strong>{formatMoneyCents(Math.round(estimatedTotal * 100))}</strong>
                </div>
              )}

              {billingMode === 'TOTAL' && sessionsPlanned > 0 && (
                <div className="form-info-inline">
                  <span>Equivalente por sessão:</span>
                  <strong>{formatMoneyCents(Math.round(perSessionValue * 100))}</strong>
                </div>
              )}
            </>
          )}

          <div className="form-row">
            {canEditSessions && (
              <div className="form-group">
                <label>Sessões planejadas</label>
                <input
                  type="number"
                  value={sessionsPlanned}
                  onChange={(e) => setSessionsPlanned(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  disabled={updateMutation.isPending}
                  min={plan.sessionsCompleted}
                />
                {plan.sessionsCompleted > 0 && (
                  <p className="form-hint">Mínimo {plan.sessionsCompleted} (já realizadas)</p>
                )}
              </div>
            )}

            {canEditInterval && (
              <div className="form-group">
                <label>Intervalo entre sessões (dias)</label>
                <input
                  type="number"
                  value={returnIntervalDays}
                  onChange={(e) => setReturnIntervalDays(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  disabled={updateMutation.isPending}
                />
              </div>
            )}
          </div>

          {canEditNotes && (
            <div className="form-group">
              <label>Observações administrativas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre este orçamento"
                rows={3}
                disabled={updateMutation.isPending}
              />
            </div>
          )}

          {errorMsg && <div className="form-error">{errorMsg}</div>}

          {(!canEditAmount || !canEditBilling || !canEditSessions) && (
            <div className="form-warning">
              ⚠️ Alguns campos estão bloqueados para proteger o histórico de sessões e pagamentos.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
