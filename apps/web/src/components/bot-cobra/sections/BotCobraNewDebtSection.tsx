import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CollectionRuleListResponseSchema, DebtPublicSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader } from '../../ui/AppUi.js';
import '../bot-cobra.css';

export function BotCobraNewDebtSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    email: '',
    valueCents: '',
    dueDate: '',
    description: '',
    collectionRulePublicId: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['bot-cobra-campaigns-select', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/collection-rules', {
        method: 'GET',
        schema: CollectionRuleListResponseSchema,
        tenantPublicId,
      }),
  });

  const campaigns = campaignsData?.items?.filter((c) => c.active) ?? [];

  const isValid =
    formData.name.trim() &&
    formData.whatsapp.trim() &&
    formData.valueCents &&
    parseFloat(formData.valueCents) > 0 &&
    formData.dueDate &&
    formData.description.trim() &&
    formData.collectionRulePublicId;

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/debts', {
        method: 'POST',
        body: {
          debtorName: formData.name,
          debtorWhatsapp: formData.whatsapp,
          debtorEmail: formData.email || null,
          amountCents: Math.round(parseFloat(formData.valueCents) * 100),
          dueDate: formData.dueDate,
          description: formData.description,
          collectionRulePublicId: formData.collectionRulePublicId,
          notes: formData.notes || null,
        },
        schema: DebtPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-list'] });
      setError(null);
      navigate('/app/bot-cobra/cobrancas');
    },
    onError: (err: any) => {
      setError(err?.message || 'Não foi possível criar a cobrança.');
    },
  });

  return (
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <PageHeader title="Nova Cobrança" description="Criar uma nova cobrança manual" />

        {error && (
          <div style={{
            background: 'var(--app-danger-soft)',
            border: '1px solid var(--app-danger)',
            color: 'var(--app-danger)',
            padding: '1rem',
            borderRadius: 'var(--app-radius-md)',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}

        <form
          style={{ maxWidth: '900px' }}
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          {/* Devedor */}
          <div className="bot-cobra-form-section">
            <h3>Informações do Devedor</h3>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Nome do Devedor *</label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>WhatsApp *</label>
                <input
                  type="text"
                  placeholder="Ex: (11) 99999-9999"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  required
                />
              </div>
              <div className="bot-cobra-form-group">
                <label>E-mail (Opcional)</label>
                <input
                  type="email"
                  placeholder="Ex: joao@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Financeiro */}
          <div className="bot-cobra-form-section">
            <h3>Informações Financeiras</h3>
            <div className="bot-cobra-form-grid">
              <div className="bot-cobra-form-group">
                <label>Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.valueCents}
                  onChange={(e) => setFormData({ ...formData, valueCents: e.target.value })}
                  required
                />
                <small style={{ color: 'var(--app-muted)', marginTop: '0.25rem' }}>Em reais (R$)</small>
              </div>
              <div className="bot-cobra-form-group">
                <label>Data de Vencimento *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="bot-cobra-form-group">
              <label>Descrição *</label>
              <textarea
                placeholder="Descreva o motivo da dívida"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                style={{ width: '100%', minHeight: '5rem' }}
              />
            </div>
          </div>

          {/* Configuração */}
          <div className="bot-cobra-form-section">
            <h3>Configuração de Cobrança</h3>
            {campaigns.length > 0 ? (
              <div className="bot-cobra-form-grid full">
                <div className="bot-cobra-form-group">
                  <label>Campanha de Cobrança *</label>
                  <select
                    value={formData.collectionRulePublicId}
                    onChange={(e) => setFormData({ ...formData, collectionRulePublicId: e.target.value })}
                    required
                  >
                    <option value="">Selecione uma campanha...</option>
                    {campaigns.map((c) => (
                      <option key={c.publicId} value={c.publicId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'var(--app-warning-soft)',
                border: '1px solid var(--app-warning)',
                color: 'var(--app-warning)',
                padding: '1rem',
                borderRadius: 'var(--app-radius-md)',
                fontSize: '0.9rem',
              }}>
                Nenhuma campanha disponível.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/app/bot-cobra/campanhas')}
                  style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Criar uma campanha
                </button>
              </div>
            )}
            <div className="bot-cobra-form-group">
              <label>Observações Internas (Opcional)</label>
              <textarea
                placeholder="Notas internas sobre esta dívida..."
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ width: '100%', minHeight: '3rem' }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={!isValid || createMutation.isPending}
              className="button"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Cobrança'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/bot-cobra')}
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
        </form>
      </div>
    </div>
  );
}
