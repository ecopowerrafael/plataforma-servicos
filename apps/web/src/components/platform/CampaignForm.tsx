import { z } from 'zod';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
});

type CampaignFormData = z.infer<typeof CampaignFormSchema>;

interface CampaignFormProps {
  initial?: Partial<CampaignFormData> & { publicId?: string };
  onClose: () => void;
  onSuccess?: () => void;
}

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

export function CampaignForm({ initial, onClose, onSuccess }: CampaignFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!initial?.publicId;

  const [formData, setFormData] = useState<CampaignFormData>({
    name: initial?.name ?? '',
    dailyLimit: initial?.dailyLimit ?? 100,
    sendingStartMinutes: initial?.sendingStartMinutes ?? 540,
    sendingEndMinutes: initial?.sendingEndMinutes ?? 1080,
    minIntervalSeconds: initial?.minIntervalSeconds ?? 30,
    maxIntervalSeconds: initial?.maxIntervalSeconds ?? 120,
    allowedWeekdays: initial?.allowedWeekdays ?? [1, 2, 3, 4, 5],
    followUpEnabled: initial?.followUpEnabled ?? false,
    followUpAfterHours: initial?.followUpAfterHours ?? 24,
    maxFollowUps: initial?.maxFollowUps ?? 2,
    autoReplyEnabled: initial?.autoReplyEnabled ?? false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: CampaignFormData) =>
      httpClient.request('/platform/prospecting/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'campaigns'] });
      onSuccess?.();
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CampaignFormData) =>
      httpClient.request(
        `/platform/prospecting/campaigns/${initial?.publicId ?? ''}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      CampaignFormSchema.parse(formData);

      // Validações adicionais
      if (formData.sendingStartMinutes >= formData.sendingEndMinutes) {
        setErrors({
          sendingEndMinutes: 'Horário de fim deve ser após horário de início',
        });
        return;
      }

      if (formData.minIntervalSeconds && formData.maxIntervalSeconds &&
          formData.minIntervalSeconds > formData.maxIntervalSeconds) {
        setErrors({
          maxIntervalSeconds: 'Intervalo máximo deve ser >= intervalo mínimo',
        });
        return;
      }

      if (formData.followUpEnabled && !formData.followUpAfterHours) {
        setErrors({
          followUpAfterHours: 'Horas é obrigatório quando follow-up está ativado',
        });
        return;
      }

      const mutation = isEditing ? updateMutation : createMutation;
      void mutation.mutateAsync(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = String(err.path[0]);
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <div className="campaign-form-container">
      <form onSubmit={handleSubmit}>
        <h2>{isEditing ? 'Editar Campanha' : 'Nova Campanha'}</h2>

        {error && (
          <div className="form-error">
            {error instanceof Error ? error.message : 'Erro ao salvar campanha'}
          </div>
        )}

        {/* Dados */}
        <section className="form-section">
          <h3>Dados</h3>
          <label>
            Nome *
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Campanhas de Verão"
              maxLength={180}
              disabled={isLoading}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
        </section>

        {/* Envio */}
        <section className="form-section">
          <h3>Envio</h3>

          <label>
            Limite Diário *
            <input
              type="number"
              value={formData.dailyLimit}
              onChange={(e) => setFormData({ ...formData, dailyLimit: Number(e.target.value) })}
              min="1"
              disabled={isLoading}
            />
            {errors.dailyLimit && <span className="field-error">{errors.dailyLimit}</span>}
          </label>

          <label>
            Horário de Início *
            <input
              type="time"
              value={minutesToTime(formData.sendingStartMinutes)}
              onChange={(e) =>
                setFormData({ ...formData, sendingStartMinutes: timeToMinutes(e.target.value) })
              }
              disabled={isLoading}
            />
          </label>

          <label>
            Horário de Fim *
            <input
              type="time"
              value={minutesToTime(formData.sendingEndMinutes)}
              onChange={(e) =>
                setFormData({ ...formData, sendingEndMinutes: timeToMinutes(e.target.value) })
              }
              disabled={isLoading}
            />
            {errors.sendingEndMinutes && (
              <span className="field-error">{errors.sendingEndMinutes}</span>
            )}
          </label>

          <fieldset>
            <legend>Dias Permitidos *</legend>
            <div className="weekdays-grid">
              {WEEKDAY_NAMES.map((name, idx) => (
                <label key={idx} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.allowedWeekdays.includes(idx)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          allowedWeekdays: [...formData.allowedWeekdays, idx].sort(),
                        });
                      } else {
                        setFormData({
                          ...formData,
                          allowedWeekdays: formData.allowedWeekdays.filter((d) => d !== idx),
                        });
                      }
                    }}
                    disabled={isLoading}
                  />
                  {name}
                </label>
              ))}
            </div>
            {errors.allowedWeekdays && (
              <span className="field-error">{errors.allowedWeekdays}</span>
            )}
          </fieldset>

          <label>
            Intervalo Mínimo (segundos)
            <input
              type="number"
              value={formData.minIntervalSeconds || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minIntervalSeconds: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              min="1"
              disabled={isLoading}
            />
            {errors.minIntervalSeconds && (
              <span className="field-error">{errors.minIntervalSeconds}</span>
            )}
          </label>

          <label>
            Intervalo Máximo (segundos)
            <input
              type="number"
              value={formData.maxIntervalSeconds || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxIntervalSeconds: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              min="1"
              disabled={isLoading}
            />
            {errors.maxIntervalSeconds && (
              <span className="field-error">{errors.maxIntervalSeconds}</span>
            )}
          </label>
        </section>

        {/* Follow-up */}
        <section className="form-section">
          <h3>Follow-up</h3>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.followUpEnabled}
              onChange={(e) =>
                setFormData({ ...formData, followUpEnabled: e.target.checked })
              }
              disabled={isLoading}
            />
            Ativar Follow-up
          </label>

          {formData.followUpEnabled && (
            <>
              <label>
                Horas para Follow-up
                <input
                  type="number"
                  value={formData.followUpAfterHours || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      followUpAfterHours: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  min="1"
                  disabled={isLoading}
                />
                {errors.followUpAfterHours && (
                  <span className="field-error">{errors.followUpAfterHours}</span>
                )}
              </label>

              <label>
                Máximo de Follow-ups
                <input
                  type="number"
                  value={formData.maxFollowUps ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxFollowUps: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  min="0"
                  disabled={isLoading}
                />
                {errors.maxFollowUps && (
                  <span className="field-error">{errors.maxFollowUps}</span>
                )}
              </label>
            </>
          )}
        </section>

        {/* Automação */}
        <section className="form-section">
          <h3>Automação</h3>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.autoReplyEnabled}
              onChange={(e) => setFormData({ ...formData, autoReplyEnabled: e.target.checked })}
              disabled={isLoading}
            />
            Resposta Automática Ativada
          </label>
        </section>

        {/* Actions */}
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={isLoading} className="secondary-button">
            Cancelar
          </button>
          <button type="submit" disabled={isLoading} className="primary-button">
            {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Campanha'}
          </button>
        </div>
      </form>
    </div>
  );
}
