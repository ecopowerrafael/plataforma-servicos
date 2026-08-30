import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import type { AudienceSelection } from './CampaignAudienceSelector.js';

interface CampaignFormData {
  name: string;
  dailyLimit: number;
  sendingStartMinutes: number;
  sendingEndMinutes: number;
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  allowedWeekdays: number[];
  followUpEnabled?: boolean;
  followUpAfterHours?: number;
  maxFollowUps?: number;
  autoReplyEnabled?: boolean;
  flowPublicId: string | null | undefined;
}

interface ProspectingFlow {
  publicId: string;
  name: string;
}

interface ProspectingCampaignReviewProps {
  audienceSelection: AudienceSelection | null;
  formData: CampaignFormData;
  onBack: () => void;
  onClose: () => void;
  onSuccess?: () => void;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function ProspectingCampaignReview({
  audienceSelection,
  formData,
  onBack,
  onClose,
  onSuccess,
}: ProspectingCampaignReviewProps) {
  const queryClient = useQueryClient();
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: flow } = useQuery({
    queryKey: ['prospecting-flow', formData.flowPublicId],
    queryFn: async () => {
      if (!formData.flowPublicId) return null;
      const response = await httpClient.request(`/platform/prospecting/flows/${formData.flowPublicId}`);
      return (response as any) as ProspectingFlow;
    },
    enabled: !!formData.flowPublicId,
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const campaignResponse = await httpClient.request('/platform/prospecting/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          dailyLimit: formData.dailyLimit,
          sendingStartMinutes: formData.sendingStartMinutes,
          sendingEndMinutes: formData.sendingEndMinutes,
          minIntervalSeconds: formData.minIntervalSeconds,
          maxIntervalSeconds: formData.maxIntervalSeconds,
          allowedWeekdays: formData.allowedWeekdays,
          followUpEnabled: formData.followUpEnabled,
          followUpAfterHours: formData.followUpAfterHours,
          maxFollowUps: formData.maxFollowUps,
          autoReplyEnabled: formData.autoReplyEnabled,
          flowPublicId: formData.flowPublicId,
        }),
      });
      return (campaignResponse as any).publicId;
    },
  });

  const materializeAudienceMutation = useMutation({
    mutationFn: async (campaignPublicId: string) => {
      if (!audienceSelection) {
        return null;
      }
      const materializeResponse = await httpClient.request(
        `/platform/prospecting/campaigns/${campaignPublicId}/materialize-audience`,
        {
          method: 'POST',
          body: JSON.stringify(audienceSelection),
        }
      );
      return materializeResponse as any;
    },
  });

  const handleCreate = async () => {
    setError(null);

    try {
      let campaignPublicId = createdCampaignId;

      // Step 1: Create campaign only if not already created
      if (!campaignPublicId) {
        campaignPublicId = await createCampaignMutation.mutateAsync();
        setCreatedCampaignId(campaignPublicId);
      }

      // Step 2: Materialize audience if selected
      if (audienceSelection && campaignPublicId) {
        await materializeAudienceMutation.mutateAsync(campaignPublicId);
      }

      // Success: invalidate and close
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'campaigns'] });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      if (!createdCampaignId) {
        // Campaign creation failed
        setError(err.message || 'Não foi possível criar a campanha.');
      } else {
        // Campaign created but materialization failed
        setError('Campanha criada, mas não foi possível adicionar o público. Tente novamente.');
      }
    }
  };

  const weekdayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const allowedDays = formData.allowedWeekdays.map((d) => weekdayNames[d]).join(', ');

  return (
    <div className="prospecting-create-step">
      <div className="step-section">
        <h2>Revisar Campanha</h2>
        <p className="step-description">Verifique todos os dados antes de criar a campanha.</p>

        {error && (
          <div className="form-error-box">
            ✗ {error}
            <button onClick={() => setError(null)} type="button" style={{ marginLeft: '1rem' }}>
              Descartar
            </button>
          </div>
        )}

        {(createCampaignMutation.isPending || materializeAudienceMutation.isPending) && (
          <div className="loading-message">
            {createCampaignMutation.isPending && 'Criando campanha...'}
            {!createCampaignMutation.isPending && materializeAudienceMutation.isPending && 'Adicionando público...'}
          </div>
        )}

        {!createCampaignMutation.isPending && !materializeAudienceMutation.isPending && createdCampaignId && (
          <div className="success-message">
            ✓ Campanha criada com sucesso!
          </div>
        )}

        {!createCampaignMutation.isPending && !materializeAudienceMutation.isPending && (
          <>
            <div className="review-section">
              <h3>Campanha</h3>
              <div className="review-item">
                <span className="review-label">Nome:</span>
                <span className="review-value">{formData.name}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Fluxo:</span>
                <span className="review-value">{flow?.name || formData.flowPublicId || 'Não selecionado'}</span>
              </div>
            </div>

            <div className="review-section">
              <h3>Público</h3>
              <div className="review-item">
                <span className="review-label">Modo:</span>
                <span className="review-value">
                  {audienceSelection?.mode === 'allFiltered' ? 'Todos os filtrados' : 'Seleção explícita'}
                </span>
              </div>
              {audienceSelection?.filters?.categoryPublicIds && audienceSelection.filters.categoryPublicIds.length > 0 && (
                <div className="review-item">
                  <span className="review-label">Categorias:</span>
                  <span className="review-value">{audienceSelection.filters.categoryPublicIds.length}</span>
                </div>
              )}
              {audienceSelection?.filters?.states && audienceSelection.filters.states.length > 0 && (
                <div className="review-item">
                  <span className="review-label">Estados:</span>
                  <span className="review-value">{audienceSelection.filters.states.join(', ')}</span>
                </div>
              )}
              {audienceSelection?.filters?.contactStatus && audienceSelection.filters.contactStatus !== 'all' && (
                <div className="review-item">
                  <span className="review-label">Status:</span>
                  <span className="review-value">{audienceSelection.filters.contactStatus}</span>
                </div>
              )}
            </div>

            <div className="review-section">
              <h3>Configuração</h3>
              <div className="review-item">
                <span className="review-label">Limite diário:</span>
                <span className="review-value">{formData.dailyLimit} envios/dia</span>
              </div>
              <div className="review-item">
                <span className="review-label">Horário:</span>
                <span className="review-value">
                  {minutesToTime(formData.sendingStartMinutes)} às {minutesToTime(formData.sendingEndMinutes)}
                </span>
              </div>
              <div className="review-item">
                <span className="review-label">Intervalo:</span>
                <span className="review-value">
                  {formData.minIntervalSeconds}–{formData.maxIntervalSeconds}s
                </span>
              </div>
              <div className="review-item">
                <span className="review-label">Dias permitidos:</span>
                <span className="review-value">{allowedDays}</span>
              </div>
              {formData.followUpEnabled && (
                <div className="review-item">
                  <span className="review-label">Seguimento:</span>
                  <span className="review-value">
                    Ativar após {formData.followUpAfterHours}h ({formData.maxFollowUps} máx)
                  </span>
                </div>
              )}
              {formData.autoReplyEnabled && (
                <div className="review-item">
                  <span className="review-label">Resposta automática:</span>
                  <span className="review-value">Ativada</span>
                </div>
              )}
            </div>
          </>
        )}

        <div className="prospecting-create-footer">
          <button
            type="button"
            onClick={onBack}
            className="secondary-button"
            disabled={createCampaignMutation.isPending || materializeAudienceMutation.isPending || createdCampaignId !== null}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="primary-button"
            disabled={createCampaignMutation.isPending || materializeAudienceMutation.isPending}
          >
            {createCampaignMutation.isPending && 'Criando campanha...'}
            {!createCampaignMutation.isPending && materializeAudienceMutation.isPending && 'Adicionando público...'}
            {!createCampaignMutation.isPending && !materializeAudienceMutation.isPending && createdCampaignId ? (
              'Campanha criada'
            ) : (
              'Criar campanha'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
