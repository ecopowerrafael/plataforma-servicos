import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CollectionRuleListResponseSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import '../bot-cobra.css';

export function BotCobraCampaignsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startHour: 9,
    endHour: 18,
    maxAttemptsPerDay: 3,
    minMinutesBetweenAttempts: 120,
    consecutiveDays: 7,
    pauseDaysAfterCycle: 1,
    maxCycles: 5,
    active: true,
  });

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['bot-cobra-campaigns', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/collection-rules', {
        method: 'GET',
        schema: CollectionRuleListResponseSchema,
        tenantPublicId,
      }),
  });

  const campaigns = campaignsData?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: formData.name,
        active: formData.active,
        cadenceType: 'CUSTOM_DAYS',
        allowedStartHour: formData.startHour,
        allowedEndHour: formData.endHour,
        maxAttemptsPerDay: formData.maxAttemptsPerDay,
        minMinutesBetweenAttempts: formData.minMinutesBetweenAttempts,
        consecutiveDays: formData.consecutiveDays,
        pauseDaysAfterCycle: formData.pauseDaysAfterCycle,
        maxCycles: formData.maxCycles,
        skipSundays: true,
        partialPaymentEnabled: true,
        partialOfferPercentages: [20, 30, 50],
        askPromiseAfterPartialPayment: true,
        promiseQuickOptionsDays: [1, 3, 7, 10],
        noResponseFollowupNextDay: true,
      };
      if (editingId && editingId !== 'new') {
        return httpClient.request(`/tenant/collection-rules/${editingId}`, {
          method: 'PATCH',
          body: payload,
          schema: CollectionRuleListResponseSchema.shape.items.element,
          tenantPublicId,
        });
      }
      return httpClient.request('/tenant/collection-rules', {
        method: 'POST',
        body: payload,
        schema: CollectionRuleListResponseSchema.shape.items.element,
        tenantPublicId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-campaigns'] });
      setEditingId(null);
      setFormData({
        name: '',
        startHour: 9,
        endHour: 18,
        maxAttemptsPerDay: 3,
        minMinutesBetweenAttempts: 120,
        consecutiveDays: 7,
        pauseDaysAfterCycle: 1,
        maxCycles: 5,
        active: true,
      });
    },
  });

  return (
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <PageHeader title="Campanhas de Cobrança" description="Gerenciar campanhas e réguas de cobrança automática" />

        {editingId && (
          <div className="bot-cobra-form-section" style={{ marginBottom: '2rem' }}>
            <h3>Editar Campanha</h3>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700 }}>Horário</h4>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Início (h)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={formData.startHour}
                  onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) })}
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>Fim (h)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={formData.endHour}
                  onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700 }}>Frequência</h4>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Tentativas/dia *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxAttemptsPerDay}
                  onChange={(e) => setFormData({ ...formData, maxAttemptsPerDay: parseInt(e.target.value) })}
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>Intervalo mínimo (min) *</label>
                <input
                  type="number"
                  min="15"
                  max="1440"
                  value={formData.minMinutesBetweenAttempts}
                  onChange={(e) => setFormData({ ...formData, minMinutesBetweenAttempts: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700 }}>Ciclo</h4>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Dias consecutivos *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.consecutiveDays}
                  onChange={(e) => setFormData({ ...formData, consecutiveDays: parseInt(e.target.value) })}
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>Pausa entre ciclos (d) *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.pauseDaysAfterCycle}
                  onChange={(e) => setFormData({ ...formData, pauseDaysAfterCycle: parseInt(e.target.value) })}
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>Máximo de ciclos *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxCycles}
                  onChange={(e) => setFormData({ ...formData, maxCycles: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
                <span style={{ fontSize: '0.9rem' }}>Campanha ativa</span>
              </label>
            </div>

            <div style={{
              background: 'var(--app-success-soft)',
              border: '1px solid var(--app-success)',
              color: 'var(--app-success)',
              padding: '1rem',
              borderRadius: 'var(--app-radius-md)',
              marginTop: '1.5rem',
              fontSize: '0.85rem',
            }}>
              <strong>Configuração:</strong> Entre {formData.startHour}:00 e {formData.endHour}:00, até {formData.maxAttemptsPerDay} mensagens/dia (mín. {formData.minMinutesBetweenAttempts}min entre), {formData.consecutiveDays}d ciclo, pausa {formData.pauseDaysAfterCycle}d, máx {formData.maxCycles} ciclos.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="button"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditingId(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                  padding: '0.5rem 0.85rem',
                  borderRadius: 'var(--app-radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 750,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!editingId && (
          <button
            onClick={() => {
              setEditingId('new');
              setFormData({
                name: '',
                startHour: 9,
                endHour: 18,
                maxAttemptsPerDay: 3,
                minMinutesBetweenAttempts: 120,
                consecutiveDays: 7,
                pauseDaysAfterCycle: 1,
                maxCycles: 5,
                active: true,
              });
            }}
            className="button"
            style={{ marginBottom: '1.5rem' }}
          >
            <IconPlus size={16} style={{ marginRight: '0.4rem' }} />
            Nova Campanha
          </button>
        )}

        {isLoading ? (
          <ListSkeleton />
        ) : campaigns && campaigns.length > 0 ? (
          <div className="bot-cobra-campaign-grid">
            {campaigns.map((campaign) => (
              <div key={campaign.publicId} className="bot-cobra-campaign-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <h3>{campaign.name}</h3>
                  <span className={`bot-cobra-badge ${campaign.active ? 'open' : 'paused'}`}>
                    {campaign.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <div className="bot-cobra-campaign-card-row">
                  <span style={{ fontWeight: 600 }}>Horário</span>
                  <span>{String(campaign.allowedStartHour).padStart(2, '0')}:00 — {String(campaign.allowedEndHour).padStart(2, '0')}:00</span>
                </div>

                <div className="bot-cobra-campaign-card-row">
                  <span style={{ fontWeight: 600 }}>Tentativas</span>
                  <span>{campaign.maxAttemptsPerDay}x/dia</span>
                </div>

                <div className="bot-cobra-campaign-card-row">
                  <span style={{ fontWeight: 600 }}>Intervalo</span>
                  <span>{(campaign as any).minMinutesBetweenAttempts || 120} min</span>
                </div>

                <div className="bot-cobra-campaign-card-row">
                  <span style={{ fontWeight: 600 }}>Ciclo</span>
                  <span>{campaign.consecutiveDays}d + {campaign.pauseDaysAfterCycle}d pausa</span>
                </div>

                <div className="bot-cobra-campaign-card-row" style={{ marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 600 }}>Máximo</span>
                  <span>{campaign.maxCycles} ciclos</span>
                </div>

                <button
                  onClick={() => {
                    setEditingId(campaign.publicId);
                    setFormData({
                      name: campaign.name,
                      startHour: campaign.allowedStartHour,
                      endHour: campaign.allowedEndHour,
                      maxAttemptsPerDay: campaign.maxAttemptsPerDay,
                      minMinutesBetweenAttempts: ((campaign as any).minMinutesBetweenAttempts || 120),
                      consecutiveDays: campaign.consecutiveDays,
                      pauseDaysAfterCycle: campaign.pauseDaysAfterCycle,
                      maxCycles: campaign.maxCycles || 5,
                      active: campaign.active,
                    });
                  }}
                  className="button"
                  style={{ width: '100%' }}
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhuma campanha criada" description="Crie uma campanha para começar a cobrar" />
        )}
      </div>
    </div>
  );
}
