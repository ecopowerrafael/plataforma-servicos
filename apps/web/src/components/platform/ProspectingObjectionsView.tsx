import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { formatDate, PageHeader, ErrorState } from './PlatformUi.js';

interface Pattern {
  id: string;
  pattern: string;
  type: 'EXACT' | 'STARTS_WITH' | 'ENDS_WITH' | 'CONTAINS';
  priority: number;
}

interface Objection {
  publicId: string;
  code?: string;
  name: string;
  description?: string;
  suggestedResponse?: string;
  autoReplyAllowed: boolean;
  isActive: boolean;
  patterns: Pattern[];
  createdAt: string;
}

const objectionsResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    code: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    suggestedResponse: z.string().optional(),
    autoReplyAllowed: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string(),
    patterns: z.array(z.object({
      id: z.string(),
      pattern: z.string(),
      type: z.string(),
      priority: z.number(),
    })),
  })),
});

const classifyPreviewSchema = z.object({
  matched: z.boolean(),
  objectionId: z.string().optional(),
  objectionName: z.string().optional(),
  confidence: z.number().optional(),
});

const patternTypeLabels: Record<string, string> = {
  EXACT: 'Exato',
  STARTS_WITH: 'Começa com',
  ENDS_WITH: 'Termina com',
  CONTAINS: 'Contém',
};

export function ProspectingObjectionsView() {
  const queryClient = useQueryClient();
  const [editingObjection, setEditingObjection] = useState<Objection | null>(null);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPatternForm, setShowPatternForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    suggestedResponse: '',
    autoReplyAllowed: false,
    isActive: true,
  });
  const [newPattern, setNewPattern] = useState({
    pattern: '',
    patternType: 'EXACT' as const,
    priority: 0,
  });

  const objections = useQuery({
    queryKey: ['prospecting', 'objections'],
    queryFn: () => httpClient.request('/platform/prospecting/objections', { schema: objectionsResponseSchema }),
  });

  const previewResult = useQuery({
    queryKey: ['prospecting', 'classify-preview', previewText],
    queryFn: () =>
      httpClient.request('/platform/prospecting/objections/classify-preview', {
        method: 'POST',
        body: JSON.stringify({ text: previewText }),
        schema: classifyPreviewSchema,
      }),
    enabled: showPreview && previewText.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      httpClient.request('/platform/prospecting/objections', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      setShowForm(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return httpClient.request(`/platform/prospecting/objections/${editingObjection?.publicId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      setShowForm(false);
      resetForm();
    },
  });

  const addPatternMutation = useMutation({
    mutationFn: (data: { objectionId: string; pattern: any }) =>
      httpClient.request(
        `/platform/prospecting/objections/${data.objectionId}/patterns`,
        {
          method: 'POST',
          body: JSON.stringify(data.pattern),
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      setNewPattern({ text: '', type: 'EXACT', priority: 0 });
    },
  });

  const updatePatternMutation = useMutation({
    mutationFn: (data: { objectionPublicId: string; patternId: string; pattern: any }) =>
      httpClient.request(
        `/platform/prospecting/objections/${data.objectionPublicId}/patterns/${data.patternId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data.pattern),
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      setEditingPattern(null);
      setShowPatternForm(false);
      setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
    },
  });

  const deletePatternMutation = useMutation({
    mutationFn: (data: { objectionPublicId: string; patternId: string }) =>
      httpClient.request(
        `/platform/prospecting/objections/${data.objectionPublicId}/patterns/${data.patternId}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
    },
  });

  const deleteObjectionMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/objections/${publicId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      suggestedResponse: '',
      autoReplyAllowed: false,
      isActive: true,
    });
    setEditingObjection(null);
  };

  const handleAddPattern = (objectionId: string) => {
    if (!newPattern.pattern.trim()) return;
    void addPatternMutation.mutateAsync({
      objectionId,
      pattern: newPattern,
    });
  };

  const handleEditPattern = (objection: Objection, pattern: Pattern) => {
    setEditingPattern(pattern);
    setNewPattern({
      pattern: pattern.pattern,
      patternType: pattern.type,
      priority: pattern.priority,
    });
    setShowPatternForm(true);
  };

  const handleSavePattern = (objectionPublicId: string) => {
    if (!newPattern.pattern.trim() || !editingPattern) return;
    void updatePatternMutation.mutateAsync({
      objectionPublicId,
      patternId: editingPattern.id,
      pattern: {
        pattern: newPattern.pattern,
        patternType: newPattern.patternType,
        priority: newPattern.priority,
      },
    });
  };

  return (
    <section>
      <PageHeader
        title="Objeções e Padrões"
        description="Gerencie objeções de leads e padrões de resposta automática."
      />

      <div className="content-actions">
        <button
          onClick={() => {
            setShowForm(true);
            resetForm();
          }}
          className="primary-button"
        >
          + Nova Objeção
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="secondary-button"
        >
          {showPreview ? 'Fechar' : 'Abrir'} Preview de Classificação
        </button>
      </div>

      {showPreview && (
        <div className="preview-simulator">
          <h3>Simulador de Classificação</h3>
          <div className="preview-input">
            <textarea
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Digite uma mensagem para simular classificação..."
              rows={3}
            />
          </div>

          {previewText && (
            <div className="preview-result">
              {previewResult.isPending ? (
                <p>Analisando...</p>
              ) : previewResult.error ? (
                <p className="error">Erro na classificação</p>
              ) : previewResult.data ? (
                <>
                  <p className="result-label">Resultado:</p>
                  <div className="result-objection">
                    <strong>{previewResult.data.code || 'Nenhuma objeção'}</strong>
                    {previewResult.data.suggestedResponse && (
                      <p className="suggested">{previewResult.data.suggestedResponse}</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="prospecting-form-backdrop" onClick={() => setShowForm(false)}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <h2>{editingObjection ? 'Editar' : 'Nova'} Objeção</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingObjection) {
                  void updateMutation.mutateAsync(formData);
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
                  Descrição
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </label>

                <label>
                  Resposta Sugerida
                  <textarea
                    value={formData.suggestedResponse}
                    onChange={(e) => setFormData({ ...formData, suggestedResponse: e.target.value })}
                    rows={3}
                  />
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.autoReplyAllowed}
                    onChange={(e) =>
                      setFormData({ ...formData, autoReplyAllowed: e.target.checked })
                    }
                  />
                  Permitir resposta automática
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                  />
                  Ativo
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

      {showPatternForm && editingPattern && (
        <div className="prospecting-form-backdrop" onClick={() => setShowPatternForm(false)}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <h2>Editar Padrão</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSavePattern(editingObjection?.publicId ?? '');
              }}
              className="campaign-form-container"
            >
              <div className="form-section">
                <label>
                  Padrão
                  <input
                    type="text"
                    value={newPattern.pattern}
                    onChange={(e) => setNewPattern({ ...newPattern, pattern: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Tipo
                  <select
                    value={newPattern.patternType}
                    onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                  >
                    <option value="EXACT">Exato</option>
                    <option value="CONTAINS">Contém</option>
                    <option value="STARTS_WITH">Começa com</option>
                    <option value="ENDS_WITH">Termina com</option>
                  </select>
                </label>

                <label>
                  Prioridade
                  <input
                    type="number"
                    value={newPattern.priority}
                    onChange={(e) => setNewPattern({ ...newPattern, priority: parseInt(e.target.value) })}
                    min="0"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowPatternForm(false)}
                  className="secondary-button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {objections.isPending ? (
        <div className="skeleton-list">
          <i className="skeleton-item" />
          <i className="skeleton-item" />
        </div>
      ) : objections.error ? (
        <ErrorState message={objections.error instanceof Error ? objections.error.message : 'Erro'} />
      ) : !objections.data?.items?.length ? (
        <div className="empty-state">
          <p>Nenhuma objeção criada ainda</p>
        </div>
      ) : (
        <div className="objections-grid">
          {objections.data.items.map((objection: Objection) => (
            <div key={objection.publicId} className="objection-card">
              <div className="card-header">
                <h3>{objection.name}</h3>
                <div className="card-badges">
                  {!objection.isActive && <span className="badge badge-muted">Inativo</span>}
                  {objection.autoReplyAllowed && (
                    <span className="badge badge-success">Auto-reply</span>
                  )}
                </div>
              </div>

              {objection.description && (
                <p className="objection-description">{objection.description}</p>
              )}

              {objection.suggestedResponse && (
                <div className="suggested-response">
                  <strong>Resposta sugerida:</strong>
                  <p>{objection.suggestedResponse}</p>
                </div>
              )}

              <div className="patterns-section">
                <strong>Padrões: {objection.patterns.length}</strong>
                {objection.patterns.length > 0 && (
                  <ul className="patterns-list">
                    {objection.patterns.map((p) => (
                      <li key={p.id} className={`pattern-${p.type.toLowerCase()}`}>
                        <div className="pattern-content">
                          <span className="pattern-type">{patternTypeLabels[p.type] || p.type}</span>
                          <span className="pattern-text">{p.pattern}</span>
                        </div>
                        <div className="pattern-actions">
                          <button
                            onClick={() => handleEditPattern(objection, p)}
                            className="secondary-button"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => void deletePatternMutation.mutateAsync({
                              objectionPublicId: objection.publicId,
                              patternId: p.id,
                            })}
                            disabled={deletePatternMutation.isPending}
                            className="danger-button"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                  <div className="pattern-input">
                  <input
                    type="text"
                    value={newPattern.pattern}
                    onChange={(e) => setNewPattern({ ...newPattern, pattern: e.target.value })}
                    placeholder="Novo padrão"
                  />
                  <div className="pattern-type-options">
                    <label>
                      <input
                        type="radio"
                        name={`pattern-type-${objection.publicId}`}
                        value="EXACT"
                        checked={newPattern.patternType === 'EXACT'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <span>Exato</span>
                      <small>Apenas mensagens exatamente iguais</small>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`pattern-type-${objection.publicId}`}
                        value="CONTAINS"
                        checked={newPattern.patternType === 'CONTAINS'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <span>Contém</span>
                      <small>Quando a expressão aparecer em qualquer parte</small>
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        const more = document.getElementById(`more-patterns-${objection.publicId}`);
                        if (more) more.style.display = more.style.display === 'none' ? 'block' : 'none';
                      }}
                    >
                      Mais opções
                    </button>
                  </div>
                  <div id={`more-patterns-${objection.publicId}`} style={{ display: 'none', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                      <input
                        type="radio"
                        name={`pattern-type-${objection.publicId}`}
                        value="STARTS_WITH"
                        checked={newPattern.patternType === 'STARTS_WITH'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <span>Começa com</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`pattern-type-${objection.publicId}`}
                        value="ENDS_WITH"
                        checked={newPattern.patternType === 'ENDS_WITH'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <span>Termina com</span>
                    </label>
                  </div>
                  <button
                    onClick={() => handleAddPattern(objection.publicId)}
                    disabled={addPatternMutation.isPending || !newPattern.pattern.trim()}
                    className="secondary-button"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="card-footer">
                <small>{formatDate(objection.createdAt)}</small>
                <div className="card-actions">
                  <button
                    onClick={() => {
                      setEditingObjection(objection);
                      setFormData({
                        name: objection.name,
                        description: objection.description ?? '',
                        suggestedResponse: objection.suggestedResponse ?? '',
                        autoReplyAllowed: objection.autoReplyAllowed,
                        isActive: objection.isActive,
                      });
                      setShowForm(true);
                    }}
                    className="secondary-button"
                  >
                    Editar
                  </button>
                  {!objection.code && (
                    <button
                      onClick={() => void deleteObjectionMutation.mutateAsync(objection.publicId)}
                      disabled={deleteObjectionMutation.isPending}
                      className="danger-button"
                    >
                      Deletar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
