import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { formatDate, PageHeader, ErrorState } from './PlatformUi.js';
import { ProspectingObjectionEditPage } from './ProspectingObjectionEditPage.js';

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

type ObjectionView = { type: 'list' } | { type: 'edit'; objectionId: string } | { type: 'create' };

export function ProspectingObjectionsView() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ObjectionView>({ type: 'list' });
  const [editingObjection, setEditingObjection] = useState<Objection | null>(null);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);
  const [editingPatternObjectionId, setEditingPatternObjectionId] = useState<string | null>(null);
  const [addingPatternObjectionId, setAddingPatternObjectionId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPatternForm, setShowPatternForm] = useState(false);
  const [showAddPatternModal, setShowAddPatternModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
      setShowAddPatternModal(false);
      setAddingPatternObjectionId(null);
      setFeedbackMessage({ type: 'success', text: 'Padrão adicionado com sucesso' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Não foi possível adicionar o padrão';
      setFeedbackMessage({ type: 'error', text: message });
      console.error('Erro ao adicionar padrão:', error);
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
      setEditingPatternObjectionId(null);
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

  const handleAddPattern = () => {
    if (!newPattern.pattern.trim() || !addingPatternObjectionId) return;
    void addPatternMutation.mutateAsync({
      objectionId: addingPatternObjectionId,
      pattern: {
        pattern: newPattern.pattern,
        patternType: newPattern.patternType,
        priority: newPattern.priority,
      },
    });
  };

  const handleEditPattern = (objection: Objection, pattern: Pattern) => {
    setEditingPattern(pattern);
    setEditingPatternObjectionId(objection.publicId);
    setNewPattern({
      pattern: pattern.pattern,
      patternType: pattern.type,
      priority: pattern.priority,
    });
    setShowPatternForm(true);
  };

  const handleSavePattern = () => {
    if (!newPattern.pattern.trim() || !editingPattern || !editingPatternObjectionId) return;
    void updatePatternMutation.mutateAsync({
      objectionPublicId: editingPatternObjectionId,
      patternId: editingPattern.id,
      pattern: {
        pattern: newPattern.pattern,
        patternType: newPattern.patternType,
        priority: newPattern.priority,
      },
    });
  };

  if (view.type === 'edit') {
    return (
      <ProspectingObjectionEditPage
        objectionId={view.objectionId}
        onBack={() => {
          setView({ type: 'list' });
          queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
        }}
        onFeedback={setFeedbackMessage}
      />
    );
  }

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
        <div className="prospecting-form-backdrop" onClick={() => {
          setShowPatternForm(false);
          setEditingPattern(null);
          setEditingPatternObjectionId(null);
          setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
        }}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <h2>Editar Padrão</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSavePattern();
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
                  onClick={() => {
                    setShowPatternForm(false);
                    setEditingPattern(null);
                    setEditingPatternObjectionId(null);
                    setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
                  }}
                  className="secondary-button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddPatternModal && addingPatternObjectionId && (
        <div className="prospecting-form-backdrop" onClick={() => {
          setShowAddPatternModal(false);
          setAddingPatternObjectionId(null);
          setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
        }}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <h2>Adicionar Padrão</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#666' }}>
              Texto que o cliente pode enviar para esta objeção
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddPattern();
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
                    placeholder="ex: quanto custa"
                    required
                  />
                </label>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Tipo de Correspondência
                  </label>
                  <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                    <input
                      type="radio"
                      name="pattern-type"
                      value="EXACT"
                      checked={newPattern.patternType === 'EXACT'}
                      onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                    />
                    <strong> Texto exato</strong>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem', marginTop: '0.25rem' }}>
                      Somente quando a mensagem for exatamente "quanto custa"
                    </div>
                  </label>

                  <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                    <input
                      type="radio"
                      name="pattern-type"
                      value="CONTAINS"
                      checked={newPattern.patternType === 'CONTAINS'}
                      onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                    />
                    <strong> Contém</strong>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem', marginTop: '0.25rem' }}>
                      Também identifica "Oi, queria saber quanto custa"
                    </div>
                  </label>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const more = document.getElementById('more-patterns-add-modal');
                      if (more) more.style.display = more.style.display === 'none' ? 'block' : 'none';
                    }}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Mais opções
                  </button>

                  <div id="more-patterns-add-modal" style={{ display: 'none', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #eee' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                      <input
                        type="radio"
                        name="pattern-type"
                        value="STARTS_WITH"
                        checked={newPattern.patternType === 'STARTS_WITH'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <strong> Começa com</strong>
                    </label>
                    <label style={{ display: 'block' }}>
                      <input
                        type="radio"
                        name="pattern-type"
                        value="ENDS_WITH"
                        checked={newPattern.patternType === 'ENDS_WITH'}
                        onChange={(e) => setNewPattern({ ...newPattern, patternType: e.target.value as any })}
                      />
                      <strong> Termina com</strong>
                    </label>
                  </div>
                </div>

                <label style={{ marginTop: '1rem' }}>
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
                <button
                  type="submit"
                  disabled={addPatternMutation.isPending}
                  className="primary-button"
                >
                  Adicionar padrão
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPatternModal(false);
                    setAddingPatternObjectionId(null);
                    setNewPattern({ pattern: '', patternType: 'EXACT', priority: 0 });
                  }}
                  className="secondary-button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feedbackMessage && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            borderRadius: '0.5rem',
            backgroundColor: feedbackMessage.type === 'success' ? '#d4edda' : '#f8d7da',
            color: feedbackMessage.type === 'success' ? '#155724' : '#721c24',
            border: `1px solid ${feedbackMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          }}
        >
          {feedbackMessage.text}
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

                <button
                  onClick={() => {
                    setAddingPatternObjectionId(objection.publicId);
                    setNewPattern({ pattern: '', patternType: 'EXACT', priority: 10 });
                    setShowAddPatternModal(true);
                  }}
                  className="secondary-button"
                  style={{ marginTop: '0.5rem' }}
                >
                  + Adicionar padrão
                </button>
              </div>

              <div className="card-footer">
                <small>{formatDate(objection.createdAt)}</small>
                <div className="card-actions">
                  <button
                    onClick={() => {
                      setView({ type: 'edit', objectionId: objection.publicId });
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
