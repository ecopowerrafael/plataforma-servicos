import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  PAUSED: 'Pausado',
  COMPLETED: 'Finalizado',
  CANCELED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'status-success',
  PAUSED: 'status-alert',
  COMPLETED: 'status-neutral',
  CANCELED: 'status-neutral',
};

export function TreatmentPlanFollowUpSection({
  treatmentPlanPublicId,
  canUpdate,
}: {
  treatmentPlanPublicId: string;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const reminderQuery = useQuery({
    queryKey: ['treatment-plan', treatmentPlanPublicId, 'reminder'],
    queryFn: () =>
      httpClient.request('/tenant/treatment-plans/:publicId/reminder', {
        params: { publicId: treatmentPlanPublicId },
      }),
    retry: false,
  });

  const sendNowMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/treatment-plans/:publicId/reminder/send-now', {
        method: 'POST',
        params: { publicId: treatmentPlanPublicId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatment-plan', treatmentPlanPublicId] });
      setConfirmAction(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/treatment-plans/:publicId/reminder/pause', {
        method: 'POST',
        params: { publicId: treatmentPlanPublicId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatment-plan', treatmentPlanPublicId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/treatment-plans/:publicId/reminder/resume', {
        method: 'POST',
        params: { publicId: treatmentPlanPublicId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatment-plan', treatmentPlanPublicId] });
    },
  });

  if (reminderQuery.isPending) {
    return <div className="treatment-plan-follow-up">Carregando follow-up…</div>;
  }

  const { state, history } = reminderQuery.data ?? { state: null, history: [] };

  if (!state) {
    return (
      <div className="treatment-plan-follow-up">
        <h3>Follow-up</h3>
        <p className="form-note">Sem acompanhamento configurado para este orçamento.</p>
      </div>
    );
  }

  const nextReminderAt = state.nextReminderAt
    ? new Date(state.nextReminderAt).toLocaleString('pt-BR')
    : 'não agendado';
  const lastReminderAt = state.lastReminderAt
    ? new Date(state.lastReminderAt).toLocaleString('pt-BR')
    : 'nunca enviado';

  return (
    <div className="treatment-plan-follow-up">
      <h3>Follow-up</h3>

      <div className="follow-up-status">
        <div className="status-info">
          <div>
            <strong>Status:</strong>{' '}
            <span className={`status-badge ${STATUS_COLORS[state.status] || 'status-neutral'}`}>
              {STATUS_LABELS[state.status] || state.status}
            </span>
          </div>
          <div>
            <strong>Próximo lembrete:</strong> {nextReminderAt}
          </div>
          <div>
            <strong>Último lembrete:</strong> {lastReminderAt}
          </div>
          <div>
            <strong>Enviados:</strong> {state.remindersSent}
          </div>
        </div>

        <div className="follow-up-actions">
          {state.status === 'ACTIVE' && (
            <>
              <button
                onClick={() => setConfirmAction('send-now')}
                disabled={!canUpdate || sendNowMutation.isPending}
                className="action-btn"
              >
                Enviar agora
              </button>
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={!canUpdate || pauseMutation.isPending}
                className="action-btn secondary"
              >
                {pauseMutation.isPending ? 'Pausando…' : 'Pausar'}
              </button>
            </>
          )}

          {state.status === 'PAUSED' && (
            <>
              <button
                onClick={() => setConfirmAction('send-now')}
                disabled={!canUpdate || sendNowMutation.isPending}
                className="action-btn"
              >
                Enviar agora
              </button>
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={!canUpdate || resumeMutation.isPending}
                className="action-btn secondary"
              >
                {resumeMutation.isPending ? 'Retomando…' : 'Retomar'}
              </button>
            </>
          )}
        </div>
      </div>

      {confirmAction === 'send-now' && (
        <div className="confirm-dialog">
          <p>Deseja enviar um lembrete por WhatsApp para este cliente agora?</p>
          <div className="confirm-buttons">
            <button
              onClick={() => sendNowMutation.mutate()}
              disabled={sendNowMutation.isPending}
              className="confirm-btn primary"
            >
              {sendNowMutation.isPending ? 'Enviando…' : 'Enviar'}
            </button>
            <button onClick={() => setConfirmAction(null)} className="confirm-btn secondary">
              Cancelar
            </button>
          </div>
          {sendNowMutation.isSuccess && (
            <p className="form-success">Lembrete enviado com sucesso!</p>
          )}
          {sendNowMutation.isError && (
            <p className="form-error">Erro ao enviar lembrete. Tente novamente.</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="follow-up-history">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="history-toggle"
          >
            {showHistory ? '▼ Ocultar histórico' : '▶ Ver histórico'} ({history.length})
          </button>

          {showHistory && (
            <div className="history-list">
              {history.map((entry: any, idx: number) => (
                <div key={idx} className="history-entry">
                  <div className="entry-header">
                    <strong>{new Date(entry.sentAt).toLocaleString('pt-BR')}</strong>
                    <span className={`status-badge ${entry.status === 'SENT' ? 'status-success' : 'status-alert'}`}>
                      {entry.status === 'SENT' ? 'Enviado' : 'Falha'}
                    </span>
                  </div>
                  <div className="entry-message">
                    <strong>Mensagem:</strong>
                    <p>{entry.sentMessage}</p>
                  </div>
                  {entry.errorMessage && (
                    <div className="entry-error">
                      <strong>Erro:</strong>
                      <p>{entry.errorMessage}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
