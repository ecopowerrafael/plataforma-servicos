import { useState, useMemo } from 'react';
import { z } from 'zod';
import { CampaignAudienceSelector, type AudienceSelection } from './CampaignAudienceSelector.js';
import { ProspectingCampaignConfiguration } from './ProspectingCampaignConfiguration.js';
import { ProspectingFlowSelector } from './ProspectingFlowSelector.js';
import { ProspectingCampaignReview } from './ProspectingCampaignReview.js';
import '../../prospecting-create.css';

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

interface ProspectingCampaignCreatePageProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProspectingCampaignCreatePage({ onClose, onSuccess }: ProspectingCampaignCreatePageProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [audienceSelection, setAudienceSelection] = useState<AudienceSelection | null>(null);
  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    dailyLimit: 100,
    sendingStartMinutes: 540,
    sendingEndMinutes: 1080,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 120,
    allowedWeekdays: [1, 2, 3, 4, 5],
    followUpEnabled: false,
    followUpAfterHours: 24,
    maxFollowUps: 2,
    autoReplyEnabled: false,
    flowPublicId: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCount = useMemo(() => {
    if (!audienceSelection) return 0;
    if (audienceSelection.mode === 'explicit') {
      return audienceSelection.businessPublicIds?.length || 0;
    }
    // For allFiltered mode, we'll get the count from counters in the selector
    return 0; // This will be displayed differently
  }, [audienceSelection]);

  const handleAudienceSelected = (selection: AudienceSelection) => {
    setAudienceSelection(selection);
    setStep(2);
  };

  const handleConfigurationContinue = (data: CampaignFormData) => {
    setErrors({});
    try {
      CampaignFormSchema.parse(data);
      if (data.sendingStartMinutes >= data.sendingEndMinutes) {
        setErrors({ sendingEndMinutes: 'Horário de fim deve ser após horário de início' });
        return;
      }
      if (data.minIntervalSeconds && data.maxIntervalSeconds && data.minIntervalSeconds > data.maxIntervalSeconds) {
        setErrors({ maxIntervalSeconds: 'Intervalo máximo deve ser >= intervalo mínimo' });
        return;
      }
      setFormData(data);
      setStep(3);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.');
          newErrors[path] = issue.message;
        }
        setErrors(newErrors);
      }
    }
  };

  const handleFlowSelected = (flowPublicId: string | null) => {
    setFormData((prev) => ({ ...prev, flowPublicId }));
    setStep(4);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev === 1 ? 1 : (prev - 1) as any));
    }
  };

  return (
    <div className="prospecting-create-page">
      <header className="prospecting-create-header">
        <div className="prospecting-create-breadcrumb">
          <button onClick={onClose} className="breadcrumb-back">
            ← Voltar para campanhas
          </button>
          <p>Prospecção / Campanhas / Nova campanha</p>
        </div>
        <h1>Nova campanha</h1>
        <p className="prospecting-create-subtitle">Configure o público, fluxo e regras antes de iniciar sua prospecção.</p>
      </header>

      <div className="prospecting-create-stepper">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`stepper-item ${step === s ? 'active' : step > s ? 'completed' : 'pending'}`}
          >
            <div className="stepper-circle">{s}</div>
            <div className="stepper-label">
              {s === 1 && 'Público'}
              {s === 2 && 'Configuração'}
              {s === 3 && 'Fluxo'}
              {s === 4 && 'Revisão'}
            </div>
          </div>
        ))}
      </div>

      <div className="prospecting-create-content">
        {step === 1 && (
          <CampaignAudienceSelector onSelectionChange={handleAudienceSelected} />
        )}

        {step === 2 && (
          <ProspectingCampaignConfiguration
            initial={formData}
            errors={errors}
            onBack={handleBack}
            onContinue={handleConfigurationContinue}
          />
        )}

        {step === 3 && (
          <ProspectingFlowSelector
            selectedFlowId={formData.flowPublicId}
            onBack={handleBack}
            onSelect={handleFlowSelected}
          />
        )}

        {step === 4 && (
          <ProspectingCampaignReview
            audienceSelection={audienceSelection}
            formData={formData}
            onBack={handleBack}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}
