import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { formatDate, PageHeader, ErrorState } from './PlatformUi.js';

interface Template {
  publicId: string;
  name: string;
  stepNumber: number;
  body: string;
  isDefault: boolean;
  variants: { variantIndex: number; body: string }[];
  updatedAt: string;
}

const templatesResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    name: z.string(),
    stepNumber: z.number(),
    body: z.string(),
    isDefault: z.boolean(),
    variants: z.array(z.object({ variantIndex: z.number(), body: z.string() })),
    updatedAt: z.string(),
  })),
});

export function ProspectingTemplatesView() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', stepNumber: 1, body: '' });
  const [newVariant, setNewVariant] = useState('');

  const templates = useQuery({
    queryKey: ['prospecting', 'templates'],
    queryFn: () => httpClient.request('/platform/prospecting/templates', { schema: templatesResponseSchema }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      // Need campaignId - will be set via parent module selection
      return httpClient.request('/platform/prospecting/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'templates'] });
      setShowForm(false);
      setFormData({ name: '', stepNumber: 1, body: '' });
    },
  });

  const addVariantMutation = useMutation({
    mutationFn: async (data: { templateId: string; body: string }) => {
      return httpClient.request(
        `/platform/prospecting/templates/${data.templateId}/variants`,
        {
          method: 'POST',
          body: JSON.stringify({ body: data.body }),
        }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'templates'] });
      setNewVariant('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/templates/${publicId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'templates'] });
      setEditingTemplate(null);
    },
  });

  const handleAddVariant = (templateId: string) => {
    if (!newVariant.trim()) return;
    void addVariantMutation.mutateAsync({ templateId, body: newVariant });
  };

  return (
    <section>
      <PageHeader
        title="Templates de Mensagem"
        description="Gerencie templates de mensagens para campanhas."
      />

      <div className="content-actions">
        <button
          onClick={() => {
            setShowForm(true);
            setEditingTemplate(null);
            setFormData({ name: '', stepNumber: 1, body: '' });
          }}
          className="primary-button"
        >
          + Novo Template
        </button>
      </div>

      {showForm && (
        <div className="prospecting-form-backdrop" onClick={() => setShowForm(false)}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <h2>{editingTemplate ? 'Editar' : 'Novo'} Template</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingTemplate) {
                  // Update logic
                } else {
                  void createMutation.mutateAsync(formData);
                }
              }}
              className="campaign-form-container"
            >
              <div className="form-section">
                <label>
                  Nome
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Passo
                  <input
                    type="number"
                    value={formData.stepNumber}
                    onChange={(e) => setFormData({ ...formData, stepNumber: parseInt(e.target.value) })}
                    min="1"
                    required
                  />
                </label>

                <label>
                  Corpo
                  <textarea
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    required
                    rows={6}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="secondary-button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {templates.isPending ? (
        <div className="skeleton-list">
          <i className="skeleton-item" />
          <i className="skeleton-item" />
        </div>
      ) : templates.error ? (
        <ErrorState message={templates.error instanceof Error ? templates.error.message : 'Erro'} />
      ) : !templates.data?.items?.length ? (
        <div className="empty-state">
          <p>Nenhum template criado ainda</p>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.data.items.map((template: Template) => (
            <div key={template.publicId} className="template-card">
              <div className="card-header">
                <h3>{template.name}</h3>
                <span className="step-badge">Passo {template.stepNumber}</span>
              </div>

              <div className="card-body">
                <p className="template-preview">{template.body.substring(0, 100)}...</p>

                {template.variants.length > 0 && (
                  <div className="variants-section">
                    <strong>Variantes: {template.variants.length}</strong>
                    <ul>
                      {template.variants.map((v) => (
                        <li key={v.variantIndex}>Variante {v.variantIndex + 1}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="variant-input">
                  <textarea
                    value={newVariant}
                    onChange={(e) => setNewVariant(e.target.value)}
                    placeholder="Adicionar variante..."
                    rows={2}
                  />
                  <button
                    onClick={() => handleAddVariant(template.publicId)}
                    disabled={addVariantMutation.isPending || !newVariant.trim()}
                    className="secondary-button"
                  >
                    Adicionar variante
                  </button>
                </div>
              </div>

              <div className="card-footer">
                <small>{formatDate(template.updatedAt)}</small>
                <div className="card-actions">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="secondary-button"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void deleteMutation.mutateAsync(template.publicId)}
                    disabled={deleteMutation.isPending}
                    className="danger-button"
                  >
                    Deletar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
