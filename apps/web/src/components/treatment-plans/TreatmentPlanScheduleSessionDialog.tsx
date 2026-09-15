import { type TreatmentPlanPublic } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import { formatMoneyCents, formatShortDate } from '../customers/customer-crm.js';

export function TreatmentPlanScheduleSessionDialog({
  plan,
  onClose,
  onSuccess,
}: {
  plan: TreatmentPlanPublic;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const sessionNumber = plan.sessionsCompleted + 1;
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [confirmed, setConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !selectedTime) {
        throw new Error('Data e hora são obrigatórias');
      }

      const [year, month, day] = selectedDate.split('-');
      const [hour, minute] = selectedTime.split(':');

      const startsAt = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
      ).toISOString();

      const result = await httpClient.request(`/tenant/appointments`, {
        method: 'POST',
        body: {
          customerPublicId: plan.customerPublicId,
          professionalPublicId: plan.professionalPublicId,
          servicePublicId: plan.servicePublicId,
          startsAt,
          treatmentPlanPublicId: plan.publicId,
        },
      });

      return result;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      setErrorMsg(
        error?.message || 'Erro ao agendar sessão. Verifique a disponibilidade.',
      );
    },
  });

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Agendar sessão #{sessionNumber}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <div className="form-info">
              <div className="info-field">
                <label>Cliente</label>
                <p>{plan.customerName}</p>
              </div>
              <div className="info-field">
                <label>Serviço</label>
                <p>{plan.serviceName}</p>
              </div>
              <div className="info-field">
                <label>Profissional</label>
                <p>{plan.professionalName}</p>
              </div>
              <div className="info-field">
                <label>Valor</label>
                <p>{formatMoneyCents(plan.amountCents)}</p>
              </div>
            </div>
          </div>

          {!confirmed ? (
            <>
              <div className="form-group">
                <label>Data da sessão</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={minDate}
                  disabled={scheduleMutation.isPending}
                />
              </div>

              <div className="form-group">
                <label>Horário</label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  disabled={scheduleMutation.isPending}
                />
              </div>

              {errorMsg && <div className="form-error">{errorMsg}</div>}

              {selectedDate && selectedTime && (
                <div className="confirmation-summary">
                  <p>
                    <strong>Confirma agendamento para:</strong>
                  </p>
                  <p>
                    {new Date(`${selectedDate}T${selectedTime}`).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="success-message">
              <p>✓ Sessão #{sessionNumber} agendada com sucesso!</p>
              <p>
                {new Date(`${selectedDate}T${selectedTime}`).toLocaleString('pt-BR')}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={scheduleMutation.isPending}
          >
            {confirmed ? 'Fechar' : 'Cancelar'}
          </button>
          {!confirmed && (
            <button
              type="button"
              className="button primary"
              onClick={() => setConfirmed(true)}
              disabled={!selectedDate || !selectedTime || scheduleMutation.isPending}
            >
              Agendar sessão
            </button>
          )}
          {confirmed && (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                scheduleMutation.mutate();
              }}
              disabled={scheduleMutation.isPending}
            >
              {scheduleMutation.isPending ? 'Confirmando...' : 'Confirmar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
