import {
  TREATMENT_PLAN_LABEL_PRESETS,
  TenantExperienceResponseSchema,
  type TreatmentPlanLabelPresetKey,
  type TenantTerminologyOverrides,
} from '@plataforma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { httpClient } from '../../lib/http.js';
import { FormSection, InlineAlert, SectionCard } from '../ui/AppUi.js';

const PRESET_NAMES: Record<TreatmentPlanLabelPresetKey | 'custom', string> = {
  aesthetic_clinic: 'Clínica de estética',
  dentistry: 'Odontologia',
  workshop: 'Oficina',
  tattoo_studio: 'Tatuagem',
  consulting: 'Consultoria',
  personal_trainer: 'Personal Trainer',
  custom: 'Personalizado',
};

export function TreatmentPlansConfigSection({
  tenantPublicId,
  terminology,
  canUpdate,
}: {
  tenantPublicId: string;
  terminology?: TenantTerminologyOverrides | null;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<TreatmentPlanLabelPresetKey | 'custom'>(
    'custom',
  );
  const emptyForm = {
    treatmentPlanModuleTitle: terminology?.treatmentPlanModuleTitle ?? '',
    treatmentPlanSingular: terminology?.treatmentPlanSingular ?? '',
    treatmentPlanPlural: terminology?.treatmentPlanPlural ?? '',
    treatmentPlanSessionSingular: terminology?.treatmentPlanSessionSingular ?? '',
    treatmentPlanSessionPlural: terminology?.treatmentPlanSessionPlural ?? '',
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    setFormData(emptyForm);
    setSelectedPreset('custom');
  }, [
    terminology?.treatmentPlanModuleTitle,
    terminology?.treatmentPlanSingular,
    terminology?.treatmentPlanPlural,
    terminology?.treatmentPlanSessionSingular,
    terminology?.treatmentPlanSessionPlural,
  ]);

  const mutation = useMutation({
    mutationFn: (data: TenantTerminologyOverrides) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/terminology`, {
        method: 'PATCH',
        body: data,
        schema: TenantExperienceResponseSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId] });
    },
  });

  const handlePresetSelect = (preset: TreatmentPlanLabelPresetKey) => {
    const presetLabels = TREATMENT_PLAN_LABEL_PRESETS[preset];
    setFormData({
      treatmentPlanModuleTitle: presetLabels.moduleTitle,
      treatmentPlanSingular: presetLabels.singular,
      treatmentPlanPlural: presetLabels.plural,
      treatmentPlanSessionSingular: presetLabels.sessionSingular,
      treatmentPlanSessionPlural: presetLabels.sessionPlural,
    });
    setSelectedPreset(preset);
  };

  const handleCustomChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSelectedPreset('custom');
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    await mutation.mutateAsync(formData);
  };

  return (
    <SectionCard
      className="treatment-plans-config-section"
      title="Orçamentos e Planos"
      description="Personalize como esse módulo aparece para o seu tipo de negócio."
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

      <form onSubmit={handleSubmit} className="treatment-plans-config-form">
        <fieldset disabled={!canUpdate}>
          <div className="preset-selector">
            <label>Selecione um modelo ou personalize:</label>
            <div className="preset-buttons">
              {(Object.keys(TREATMENT_PLAN_LABEL_PRESETS) as TreatmentPlanLabelPresetKey[]).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={selectedPreset === preset ? 'preset-btn active' : 'preset-btn'}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    {PRESET_NAMES[preset]}
                  </button>
                ),
              )}
              <button
                type="button"
                className={selectedPreset === 'custom' ? 'preset-btn active' : 'preset-btn'}
                onClick={() => setSelectedPreset('custom')}
              >
                {PRESET_NAMES.custom}
              </button>
            </div>
          </div>

          <FormSection columns={1}>
            <label>
              Título do módulo
              <input
                type="text"
                value={formData.treatmentPlanModuleTitle}
                onChange={(e) => handleCustomChange('treatmentPlanModuleTitle', e.target.value)}
                maxLength={80}
                placeholder="Ex: Orçamentos e Planos"
              />
            </label>

            <FormSection columns={2}>
              <label>
                Singular
                <input
                  type="text"
                  value={formData.treatmentPlanSingular}
                  onChange={(e) => handleCustomChange('treatmentPlanSingular', e.target.value)}
                  maxLength={80}
                  placeholder="Ex: Orçamento/Plano"
                />
              </label>

              <label>
                Plural
                <input
                  type="text"
                  value={formData.treatmentPlanPlural}
                  onChange={(e) => handleCustomChange('treatmentPlanPlural', e.target.value)}
                  maxLength={80}
                  placeholder="Ex: Orçamentos/Planos"
                />
              </label>
            </FormSection>

            <FormSection columns={2}>
              <label>
                Sessão (singular)
                <input
                  type="text"
                  value={formData.treatmentPlanSessionSingular}
                  onChange={(e) =>
                    handleCustomChange('treatmentPlanSessionSingular', e.target.value)
                  }
                  maxLength={80}
                  placeholder="Ex: Sessão"
                />
              </label>

              <label>
                Sessão (plural)
                <input
                  type="text"
                  value={formData.treatmentPlanSessionPlural}
                  onChange={(e) => handleCustomChange('treatmentPlanSessionPlural', e.target.value)}
                  maxLength={80}
                  placeholder="Ex: Sessões"
                />
              </label>
            </FormSection>
          </FormSection>

          <button type="submit" className="submit-button" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </fieldset>
      </form>
    </SectionCard>
  );
}
