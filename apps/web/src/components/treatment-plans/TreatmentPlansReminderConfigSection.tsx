import { TreatmentPlanReminderConfigSchema, type TreatmentPlanReminderConfig } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';

const DELAY_UNITS = [
  { value: 'HOUR', label: 'horas' },
  { value: 'DAY', label: 'dias' },
];

export function TreatmentPlansReminderConfigSection({
  tenantPublicId,
  canUpdate,
  treatmentPlanLabels,
}: {
  tenantPublicId: string;
  canUpdate: boolean;
  treatmentPlanLabels?: { singular: string };
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<TreatmentPlanReminderConfig | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const configQuery = useQuery({
    queryKey: ['tenant', tenantPublicId, 'reminder-config'],
    queryFn: () =>
      httpClient.request('/platform/tenants/:publicId/reminder-config', {
        params: { publicId: tenantPublicId },
      }),
    retry: false,
    onSuccess: (data) => {
      setFormData(data);
    },
  });

  const mutation = useMutation({
    mutationFn: (data: TreatmentPlanReminderConfig) =>
      httpClient.request('/platform/tenants/:publicId/reminder-config', {
        method: 'PATCH',
        body: data,
        params: { publicId: tenantPublicId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'reminder-config'] });
    },
  });

  const handleToggleReminders = (enabled: boolean) => {
    if (!formData) return;
    setFormData((prev) => (prev ? { ...prev, enabled } : null));
  };

  const handleSequenceChange = (index: number, field: string, value: any) => {
    if (!formData) return;
    const newSequence = [...(formData.sequence as any[])];
    newSequence[index] = {
      ...newSequence[index],
      [field]: value,
    };
    setFormData((prev) => (prev ? { ...prev, sequence: newSequence } : null));
  };

  const handleAddStep = () => {
    if (!formData) return;
    const newSequence = [...(formData.sequence as any[])];
    const lastDelay = newSequence[newSequence.length - 1]?.delayValue ?? 7;
    newSequence.push({
      enabled: true,
      delayValue: lastDelay + 7,
      delayUnit: 'DAY',
      message: `Lembrete sobre seu ${treatmentPlanLabels?.singular ?? 'orçamento'}...`,
    });
    setFormData((prev) => (prev ? { ...prev, sequence: newSequence } : null));
  };

  const handleRemoveStep = (index: number) => {
    if (!formData) return;
    const newSequence = (formData.sequence as any[]).filter((_, i) => i !== index);
    setFormData((prev) => (prev ? { ...prev, sequence: newSequence } : null));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData) return;
    try {
      const validated = TreatmentPlanReminderConfigSchema.parse(formData);
      await mutation.mutateAsync(validated);
    } catch (error) {
      // Schema validation error
    }
  };

  if (configQuery.isPending) {
    return <p>Carregando configuração de lembretes…</p>;
  }

  if (configQuery.isError) {
    return <p className="form-error">Não foi possível carregar a configuração.</p>;
  }

  if (!formData) {
    return null;
  }

  const sequence = formData.sequence as any[];

  return (
    <fieldset className="treatment-plans-reminder-config-section" disabled={!canUpdate}>
      <legend>Lembretes automáticos de orçamento</legend>

      {!canUpdate && (
        <p className="form-note">Você não tem permissão para atualizar estas configurações.</p>
      )}

      {mutation.isError && (
        <p className="form-error">Não foi possível salvar as configurações.</p>
      )}

      {mutation.isSuccess && (
        <p className="form-success">Configurações atualizadas com sucesso.</p>
      )}

      <form onSubmit={handleSubmit} className="treatment-plans-reminder-form">
        <div className="reminder-toggle">
          <label>
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => handleToggleReminders(e.target.checked)}
              disabled={!canUpdate}
            />
            Ativar lembretes automáticos
          </label>
          <p className="form-note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Os prazos são acumulados desde a criação do orçamento (D+1, D+3, D+7)
          </p>
        </div>

        {formData.enabled && (
          <>
            <div className="reminder-channel">
              <label>Canal:</label>
              <select value={formData.channel} disabled>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
              <p className="form-note" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Outras opções de canal em breve
              </p>
            </div>

            <div className="reminder-sequence">
              <h3>Sequência de lembretes</h3>
              <div className="sequence-list">
                {sequence.map((step, index) => (
                  <div key={index} className="sequence-step">
                    <div className="step-header">
                      <label className="step-number">Lembrete {index + 1}</label>
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(index)}
                        className="remove-btn"
                        disabled={!canUpdate || sequence.length <= 1}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="step-controls">
                      <label>
                        <input
                          type="checkbox"
                          checked={step.enabled}
                          onChange={(e) =>
                            handleSequenceChange(index, 'enabled', e.target.checked)
                          }
                          disabled={!canUpdate}
                        />
                        Ativo
                      </label>

                      <div className="delay-group">
                        <label>Prazo:</label>
                        <input
                          type="number"
                          min="1"
                          value={step.delayValue}
                          onChange={(e) =>
                            handleSequenceChange(index, 'delayValue', parseInt(e.target.value))
                          }
                          disabled={!canUpdate}
                        />
                        <select
                          value={step.delayUnit}
                          onChange={(e) =>
                            handleSequenceChange(index, 'delayUnit', e.target.value)
                          }
                          disabled={!canUpdate}
                        >
                          {DELAY_UNITS.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="message-group">
                      <label>Mensagem:</label>
                      <textarea
                        value={step.message}
                        onChange={(e) =>
                          handleSequenceChange(index, 'message', e.target.value)
                        }
                        disabled={!canUpdate}
                        rows={3}
                      />
                      <p className="form-note" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Use: {'{{customerName}}'} {'{{treatmentPlanSingular}}'} {'{{treatmentTitle}}'}{' '}
                        {'{{amount}}'} {'{{tenantName}}'}
                      </p>

                      {previewIndex === index && (
                        <div className="message-preview">
                          <strong>Preview:</strong>
                          <p>
                            {step.message
                              .replace('{{customerName}}', 'João')
                              .replace(
                                '{{treatmentPlanSingular}}',
                                treatmentPlanLabels?.singular ?? 'orçamento',
                              )
                              .replace('{{treatmentTitle}}', 'Limpeza')
                              .replace('{{amount}}', 'R$ 500,00')
                              .replace('{{tenantName}}', 'Sua Clínica')}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setPreviewIndex(previewIndex === index ? null : index)
                        }
                        className="preview-btn"
                      >
                        {previewIndex === index ? 'Ocultar preview' : 'Ver preview'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddStep}
                className="add-step-btn"
                disabled={!canUpdate}
              >
                + Adicionar etapa
              </button>
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            type="submit"
            disabled={!canUpdate || mutation.isPending || configQuery.isPending}
            className="submit-btn"
          >
            {mutation.isPending ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>
      </form>
    </fieldset>
  );
}
