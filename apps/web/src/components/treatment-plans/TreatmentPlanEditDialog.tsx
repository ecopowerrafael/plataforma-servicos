import { type TreatmentPlanPublic, UpdateTreatmentPlanRequestSchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import { formatMoneyCents } from '../customers/customer-crm.js';

export function TreatmentPlanEditDialog({
  plan,
  onClose,
  onSuccess,
}: {
  plan: TreatmentPlanPublic;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [amountCents, setAmountCents] = useState(plan.amountCents / 100);
  const [sessionsPlanned, setSessionsPlanned] = useState(plan.sessionsPlanned ?? 0);
  const [returnIntervalDays, setReturnIntervalDays] = useState(plan.returnIntervalDays ?? 0);
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const result = await httpClient.request(`/tenant/treatment-plans/${plan.publicId}`, {
        method: 'PATCH',
        body: {
          title,
          amountCents: Math.round(amountCents * 100),
          sessionsPlanned: sessionsPlanned || null,
          returnIntervalDays: returnIntervalDays || null,
          notes: notes || null,
          billingMode: plan.billingMode,
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

          <div className="form-row">
            <div className="form-group">
              <label>Valor por sessão (R$)</label>
              <input
                type="number"
                value={amountCents}
                onChange={(e) => setAmountCents(parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                step="0.01"
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="form-group">
              <label>Sessões planejadas</label>
              <input
                type="number"
                value={sessionsPlanned}
                onChange={(e) => setSessionsPlanned(parseInt(e.target.value) || 0)}
                placeholder="0"
                disabled={updateMutation.isPending}
              />
            </div>
          </div>

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

          <div className="form-group">
            <label>Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionais sobre este orçamento"
              rows={4}
              disabled={updateMutation.isPending}
            />
          </div>

          {errorMsg && <div className="form-error">{errorMsg}</div>}
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
