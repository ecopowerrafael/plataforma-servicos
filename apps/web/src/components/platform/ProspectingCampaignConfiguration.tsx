import { z } from 'zod';
import { useState } from 'react';

const CampaignFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  dailyLimit: z.number().int().positive('Limite deve ser maior que 0'),
  sendingStartMinutes: z.number().int().min(0).max(1440),
  sendingEndMinutes: z.number().int().min(0).max(1440),
  minIntervalSeconds: z.number().int().positive('Intervalo mínimo deve ser positivo').optional(),
  maxIntervalSeconds: z.number().int().positive('Intervalo máximo deve ser positivo').optional(),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos 1 dia'),
  followUpEnabled: z.boolean().optional().default(false),
  followUpAfterHours: z.number().int().positive().optional(),
  maxFollowUps: z.number().int().min(0).optional(),
  autoReplyEnabled: z.boolean().optional().default(false),
  flowPublicId: z.string().uuid().nullable().optional(),
});

type CampaignFormData = z.infer<typeof CampaignFormSchema>;

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return (hours || 0) * 60 + (mins || 0);
}

interface ProspectingCampaignConfigurationProps {
  initial: CampaignFormData;
  errors: Record<string, string>;
  onBack: () => void;
  onContinue: (data: CampaignFormData) => void;
}

export function ProspectingCampaignConfiguration({
  initial,
  errors,
  onBack,
  onContinue,
}: ProspectingCampaignConfigurationProps) {
  const [formData, setFormData] = useState<CampaignFormData>(initial);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue(formData);
  };

  return (
    <div className="prospecting-create-step">
      <div className="step-section">
        <h2>Configuração da Campanha</h2>
        <p className="step-description">Configure os parâmetros de envio e comportamento da campanha.</p>

        <form onSubmit={handleSubmit} className="prospecting-campaign-form">
          <div className="form-group">
            <label htmlFor="campaign-name">
              Nome da campanha
              <input
                id="campaign-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Prospecção Barbearias SP"
                className={errors.name ? 'error' : ''}
              />
            </label>
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="daily-limit">
                Limite diário de envios
                <input
                  id="daily-limit"
                  type="number"
                  min="1"
                  value={formData.dailyLimit}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dailyLimit: parseInt(e.target.value) || 1 }))}
                  className={errors.dailyLimit ? 'error' : ''}
                />
              </label>
              {errors.dailyLimit && <span className="form-error">{errors.dailyLimit}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="min-interval">
                Intervalo mínimo (segundos)
                <input
                  id="min-interval"
                  type="number"
                  min="1"
                  value={formData.minIntervalSeconds}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, minIntervalSeconds: parseInt(e.target.value) || 30 }))
                  }
                  className={errors.minIntervalSeconds ? 'error' : ''}
                />
              </label>
              {errors.minIntervalSeconds && <span className="form-error">{errors.minIntervalSeconds}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="max-interval">
                Intervalo máximo (segundos)
                <input
                  id="max-interval"
                  type="number"
                  min="1"
                  value={formData.maxIntervalSeconds}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, maxIntervalSeconds: parseInt(e.target.value) || 120 }))
                  }
                  className={errors.maxIntervalSeconds ? 'error' : ''}
                />
              </label>
              {errors.maxIntervalSeconds && <span className="form-error">{errors.maxIntervalSeconds}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="start-time">
                Horário de início
                <input
                  id="start-time"
                  type="time"
                  value={minutesToTime(formData.sendingStartMinutes)}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, sendingStartMinutes: timeToMinutes(e.target.value) }))
                  }
                  className={errors.sendingStartMinutes ? 'error' : ''}
                />
              </label>
              {errors.sendingStartMinutes && <span className="form-error">{errors.sendingStartMinutes}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="end-time">
                Horário de término
                <input
                  id="end-time"
                  type="time"
                  value={minutesToTime(formData.sendingEndMinutes)}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, sendingEndMinutes: timeToMinutes(e.target.value) }))
                  }
                  className={errors.sendingEndMinutes ? 'error' : ''}
                />
              </label>
              {errors.sendingEndMinutes && <span className="form-error">{errors.sendingEndMinutes}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Dias permitidos</label>
            <div className="weekday-grid">
              {WEEKDAY_NAMES.map((name, index) => (
                <label key={index} className="weekday-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.allowedWeekdays.includes(index)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData((prev) => ({
                          ...prev,
                          allowedWeekdays: [...prev.allowedWeekdays, index].sort(),
                        }));
                      } else {
                        setFormData((prev) => ({
                          ...prev,
                          allowedWeekdays: prev.allowedWeekdays.filter((d) => d !== index),
                        }));
                      }
                    }}
                  />
                  {name}
                </label>
              ))}
            </div>
            {errors.allowedWeekdays && <span className="form-error">{errors.allowedWeekdays}</span>}
          </div>

          <div className="form-section-divider"></div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.followUpEnabled}
                onChange={(e) => setFormData((prev) => ({ ...prev, followUpEnabled: e.target.checked }))}
              />
              Ativar seguimento automático
            </label>
          </div>

          {formData.followUpEnabled && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="followup-hours">
                  Aguardar (horas)
                  <input
                    id="followup-hours"
                    type="number"
                    min="1"
                    value={formData.followUpAfterHours}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, followUpAfterHours: parseInt(e.target.value) || 24 }))
                    }
                  />
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="max-followups">
                  Máx de seguimentos
                  <input
                    id="max-followups"
                    type="number"
                    min="0"
                    value={formData.maxFollowUps}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxFollowUps: parseInt(e.target.value) || 0 }))}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.autoReplyEnabled}
                onChange={(e) => setFormData((prev) => ({ ...prev, autoReplyEnabled: e.target.checked }))}
              />
              Ativar resposta automática
            </label>
          </div>

          <div className="prospecting-create-footer">
            <button type="button" onClick={onBack} className="secondary-button">
              Voltar
            </button>
            <button type="submit" className="primary-button">
              Continuar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
