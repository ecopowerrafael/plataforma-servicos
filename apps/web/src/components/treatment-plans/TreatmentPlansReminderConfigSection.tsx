import {
  TreatmentPlanReminderConfigSchema,
  type TreatmentPlanReminderConfig,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { InlineAlert, ListSkeleton, SectionCard, Switch } from '../ui/AppUi.js';

type ReminderStep = TreatmentPlanReminderConfig['sequence'][number];
type ReminderStepField = keyof ReminderStep;
const DELAY_UNIT_LABELS = [
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
      httpClient.request(`/platform/tenants/${tenantPublicId}/reminder-config`, {
        schema: TreatmentPlanReminderConfigSchema,
      }),
    retry: false,
  });

  useEffect(() => {
    if (configQuery.data !== undefined) setFormData(configQuery.data);
  }, [configQuery.data]);

  const mutation = useMutation({
    mutationFn: (data: TreatmentPlanReminderConfig) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/reminder-config`, {
        method: 'PATCH',
        body: data,
        schema: TreatmentPlanReminderConfigSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'reminder-config'] });
    },
  });

  const handleToggleReminders = (enabled: boolean) => {
    if (!formData) return;
    setFormData((prev) => (prev ? { ...prev, enabled } : null));
  };

  const handleSequenceChange = <K extends ReminderStepField>(
    index: number,
    field: K,
    value: ReminderStep[K],
  ) => {
    if (!formData) return;
    setFormData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        sequence: prev.sequence.map((step, stepIndex) =>
          stepIndex === index ? { ...step, [field]: value } : step,
        ),
      };
    });
  };

  const handleAddStep = () => {
    if (!formData) return;
    const lastDelay = formData.sequence.at(-1)?.delayValue ?? 7;
    const newStep: ReminderStep = {
      enabled: true,
      delayValue: lastDelay + 7,
      delayUnit: 'DAY',
      message: `Lembrete sobre seu ${treatmentPlanLabels?.singular ?? 'orçamento'}...`,
    };
    setFormData((prev) => (prev ? { ...prev, sequence: [...prev.sequence, newStep] } : null));
  };

  const handleRemoveStep = (index: number) => {
    if (!formData) return;
    const newSequence = formData.sequence.filter((_, i) => i !== index);
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
    return <ListSkeleton rows={4} />;
  }

  if (configQuery.isError) {
    return <InlineAlert tone="danger">Não foi possível carregar os lembretes.</InlineAlert>;
  }

  if (!formData) {
    return null;
  }

  const sequence = formData.sequence;

  return (
    <SectionCard
      className="treatment-plans-reminder-config-section"
      title="Lembretes automáticos de orçamento"
      description="Envie lembretes pelo WhatsApp após a criação de um orçamento."
    >
      {!canUpdate && (
        <InlineAlert tone="warning">
          Você não tem permissão para atualizar estas configurações.
        </InlineAlert>
      )}

      {mutation.isError && (
        <InlineAlert tone="danger">Não foi possível salvar as configurações.</InlineAlert>
      )}

      {mutation.isSuccess && <InlineAlert>Configurações atualizadas com sucesso.</InlineAlert>}

      <form onSubmit={handleSubmit} className="treatment-plans-reminder-form">
        <div className="reminder-toggle">
          <Switch
            checked={formData.enabled}
            onChange={handleToggleReminders}
            disabled={!canUpdate}
            label="Ativar lembretes automáticos"
          />
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
                          onChange={(e) => handleSequenceChange(index, 'enabled', e.target.checked)}
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
                            handleSequenceChange(
                              index,
                              'delayUnit',
                              e.target.value as ReminderStep['delayUnit'],
                            )
                          }
                          disabled={!canUpdate}
                        >
                          {DELAY_UNIT_LABELS.map((unit) => (
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
                        onChange={(e) => handleSequenceChange(index, 'message', e.target.value)}
                        disabled={!canUpdate}
                        rows={3}
                      />
                      <p className="form-note" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Use: {'{{customerName}}'} {'{{treatmentPlanSingular}}'}{' '}
                        {'{{treatmentTitle}}'} {'{{amount}}'} {'{{tenantName}}'}
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
                        onClick={() => setPreviewIndex(previewIndex === index ? null : index)}
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
    </SectionCard>
  );
}
