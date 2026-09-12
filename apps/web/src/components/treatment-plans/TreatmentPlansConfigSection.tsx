import {
  TREATMENT_PLAN_LABEL_PRESETS,
  type TreatmentPlanLabelPresetKey,
  type TenantTerminologyOverrides,
} from '@plataforma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

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
  const [selectedPreset, setSelectedPreset] = useState<TreatmentPlanLabelPresetKey | 'custom'>('custom');
  const [formData, setFormData] = useState({
    treatmentPlanModuleTitle: terminology?.treatmentPlanModuleTitle ?? '',
    treatmentPlanSingular: terminology?.treatmentPlanSingular ?? '',
    treatmentPlanPlural: terminology?.treatmentPlanPlural ?? '',
    treatmentPlanSessionSingular: terminology?.treatmentPlanSessionSingular ?? '',
    treatmentPlanSessionPlural: terminology?.treatmentPlanSessionPlural ?? '',
  });

  const mutation = useMutation({
    mutationFn: (data: TenantTerminologyOverrides) =>
      httpClient.request('/platform/tenants/:publicId/terminology', {
        method: 'PATCH',
        body: data,
        params: { publicId: tenantPublicId },
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await mutation.mutateAsync(formData);
  };

  return (
    <fieldset className="treatment-plans-config-section" disabled={!canUpdate}>
      <legend>Orçamentos e Planos</legend>

      {!canUpdate && (
        <p className="form-note">Você não tem permissão para atualizar estas configurações.</p>
      )}

      {mutation.isError && (
        <p className="form-error">Não foi possível salvar as configurações.</p>
      )}

      {mutation.isSuccess && (
        <p className="form-success">Configurações atualizadas com sucesso.</p>
      )}

      <form onSubmit={handleSubmit} className="treatment-plans-config-form">
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

        <div className="config-fields">
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

          <div className="field-group">
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
          </div>

          <div className="field-group">
            <label>
              Sessão (singular)
              <input
                type="text"
                value={formData.treatmentPlanSessionSingular}
                onChange={(e) => handleCustomChange('treatmentPlanSessionSingular', e.target.value)}
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
          </div>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </form>
    </fieldset>
  );
}
