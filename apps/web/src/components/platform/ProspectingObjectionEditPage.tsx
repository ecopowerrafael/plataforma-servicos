import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import './prospecting-objections.css';

const patternTypeLabels: Record<string, string> = {
  EXACT: 'Exato',
  STARTS_WITH: 'Começa com',
  ENDS_WITH: 'Termina com',
  CONTAINS: 'Contém',
};

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

const patternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  type: z.string(),
  priority: z.number(),
});

const objectionsSchema = z.object({
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

type PatternView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; patternId: string };

export const ProspectingObjectionEditPage = ({
  objectionId,
  onBack,
}: {
  objectionId: string;
  onBack: () => void;
}) => {
  const queryClient = useQueryClient();
  const [objection, setObjection] = useState<Objection | null>(null);
  const [patternView, setPatternView] = useState<PatternView>({ type: 'list' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    suggestedResponse: '',
    autoReplyAllowed: false,
    isActive: true,
  });

  const { data: objections, isLoading, error } = useQuery({
    queryKey: ['prospecting', 'objections'],
    queryFn: () => httpClient.request('/platform/prospecting/objections', { schema: objectionsResponseSchema }),
  });

  useEffect(() => {
    if (objections?.items) {
      const found = objections.items.find((o: Objection) => o.publicId === objectionId);
      if (found) {
        setObjection(found as Objection);
        setFormData({
          name: found.name,
          description: found.description ?? '',
          suggestedResponse: found.suggestedResponse ?? '',
          autoReplyAllowed: found.autoReplyAllowed,
          isActive: found.isActive,
        });
      }
    }
  }, [objections, objectionId]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return httpClient.request(`/platform/prospecting/objections/${objectionId}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
        schema: z.object({
          publicId: z.string(),
          code: z.string().optional(),
          name: z.string(),
          description: z.string().optional(),
          suggestedResponse: z.string().optional(),
          autoReplyAllowed: z.boolean(),
          isActive: z.boolean(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      setFeedback({ type: 'success', message: 'Objeção atualizada' });
    },
    onError: () => setFeedback({ type: 'error', message: 'Erro ao atualizar objeção' }),
  });

  if (isLoading) {
    return (
      <div className="objection-editor-page">
        <div className="objection-editor-header">
          <button className="back-button" onClick={onBack}>← Voltar para objeções</button>
        </div>
        <div className="loading">Carregando objeção...</div>
      </div>
    );
  }

  if (error || !objection) {
    return (
      <div className="objection-editor-page">
        <div className="objection-editor-header">
          <button className="back-button" onClick={onBack}>← Voltar para objeções</button>
        </div>
        <ErrorState message="Não foi possível carregar a objeção" />
      </div>
    );
  }

  return (
    <div className="objection-editor-page">
      <div className="objection-editor-header">
        <button className="back-button" onClick={onBack}>← Voltar para objeções</button>
        <div className="objection-editor-breadcrumb">Prospecção / Objeções / Editar</div>
        <span className={`badge ${objection.isActive ? 'badge-active' : 'badge-inactive'}`}>
          {objection.isActive ? 'Ativa' : 'Inativa'}
        </span>
      </div>

      {feedback && (
        <div className="objection-feedback-message" data-type={feedback.type}>
          {feedback.message}
        </div>
      )}

      <div className="objection-editor-container">
        {/* Settings Column */}
        <div className="objection-editor-settings">
          <div className="objection-settings-card">
            <h2>{objection.name}</h2>

            <div className="form-group">
              <label>Nome</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
                placeholder="Nome da objeção"
              />
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-input"
                placeholder="Descrição breve da objeção"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Resposta Sugerida</label>
              <div className="form-hint">Mensagem que poderá ser enviada quando essa objeção for identificada</div>
              <textarea
                value={formData.suggestedResponse}
                onChange={(e) => setFormData({ ...formData, suggestedResponse: e.target.value })}
                className="form-input"
                placeholder="Escreva a resposta sugerida"
                rows={4}
              />
              {formData.autoReplyAllowed && (
                <div className="form-info">Envio automático permitido</div>
              )}
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.autoReplyAllowed}
                  onChange={(e) => setFormData({ ...formData, autoReplyAllowed: e.target.checked })}
                />
                Permitir resposta automática
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Ativa
              </label>
            </div>

            <button
              className="primary-button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              Salvar Alterações
            </button>
          </div>
        </div>

        {/* Patterns Column */}
        <div className="objection-editor-patterns">
          {patternView.type === 'list' ? (
            <div className="objection-patterns-card">
              <h3>Padrões de Reconhecimento</h3>
              <p className="form-hint">Configure como o sistema reconhece respostas que levam a essa objeção</p>

              {objection.patterns.length === 0 ? (
                <div className="empty-state">Nenhum padrão configurado</div>
              ) : (
                <div className="patterns-list">
                  {objection.patterns.map((p) => (
                    <PatternRow
                      key={p.id}
                      pattern={p}
                      objectionId={objectionId}
                      onEdit={() => setPatternView({ type: 'edit', patternId: p.id })}
                      onDelete={(msg) => setFeedback({ type: 'success', message: msg })}
                    />
                  ))}
                </div>
              )}

              <button
                className="secondary-button"
                onClick={() => setPatternView({ type: 'create' })}
              >
                + Adicionar Padrão
              </button>
            </div>
          ) : patternView.type === 'create' ? (
            <AddPatternForm
              objectionId={objectionId}
              onClose={() => setPatternView({ type: 'list' })}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
                setPatternView({ type: 'list' });
                setFeedback({ type: 'success', message: 'Padrão adicionado' });
              }}
              onError={(msg) => setFeedback({ type: 'error', message: msg })}
            />
          ) : patternView.type === 'edit' ? (
            <EditPatternForm
              patternId={patternView.patternId}
              objectionId={objectionId}
              pattern={objection.patterns.find((p) => p.id === patternView.patternId)}
              onClose={() => setPatternView({ type: 'list' })}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
                setPatternView({ type: 'list' });
                setFeedback({ type: 'success', message: 'Padrão atualizado' });
              }}
              onError={(msg) => setFeedback({ type: 'error', message: msg })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PatternRow = ({
  pattern,
  objectionId,
  onEdit,
  onDelete,
}: {
  pattern: Pattern;
  objectionId: string;
  onEdit: () => void;
  onDelete: (msg: string) => void;
}) => {
  const queryClient = useQueryClient();

  const deletePatternMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/prospecting/objections/${objectionId}/patterns/${pattern.id}`, {
        method: 'DELETE',
        schema: z.any(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      onDelete('Padrão removido');
    },
    onError: () => onDelete('Erro ao remover padrão'),
  });

  return (
    <div className="pattern-row">
      <div className="pattern-type-badge">{patternTypeLabels[pattern.type]}</div>
      <div className="pattern-text">{pattern.pattern}</div>
      <div className="pattern-priority">Prio {pattern.priority}</div>
      <div className="pattern-actions">
        <button className="secondary-button" onClick={onEdit}>
          Editar
        </button>
        <button
          className="danger-button"
          onClick={() => {
            if (confirm('Remover padrão? Esta ação não pode ser desfeita.')) {
              deletePatternMutation.mutate();
            }
          }}
        >
          Excluir
        </button>
      </div>
    </div>
  );
};

const AddPatternForm = ({
  objectionId,
  onClose,
  onSuccess,
  onError,
}: {
  objectionId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) => {
  const [pattern, setPattern] = useState('');
  const [patternType, setPatternType] = useState('EXACT');
  const [priority, setPriority] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      return httpClient.request(`/platform/prospecting/objections/${objectionId}/patterns`, {
        method: 'POST',
        body: JSON.stringify({ pattern, type: patternType, priority }),
        schema: patternSchema,
      });
    },
    onSuccess,
    onError: () => onError('Erro ao adicionar padrão'),
  });

  return (
    <div className="objection-patterns-card">
      <h3>Novo Padrão</h3>

      <div className="form-group">
        <label>Padrão</label>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="form-input"
          placeholder="ex: contato errado"
        />
      </div>

      <div className="form-group">
        <label>Tipo de Correspondência</label>
        <div className="pattern-type-options">
          <label className="pattern-type-option">
            <input
              type="radio"
              name="type"
              value="EXACT"
              checked={patternType === 'EXACT'}
              onChange={(e) => setPatternType(e.target.value)}
            />
            <div>
              <strong>Exato</strong>
              <p>A mensagem precisa ser exatamente igual</p>
            </div>
          </label>

          <label className="pattern-type-option">
            <input
              type="radio"
              name="type"
              value="CONTAINS"
              checked={patternType === 'CONTAINS'}
              onChange={(e) => setPatternType(e.target.value)}
            />
            <div>
              <strong>Contém</strong>
              <p>Identifica quando o texto aparece em qualquer parte</p>
            </div>
          </label>

          <label className="pattern-type-option">
            <input
              type="radio"
              name="type"
              value="STARTS_WITH"
              checked={patternType === 'STARTS_WITH'}
              onChange={(e) => setPatternType(e.target.value)}
            />
            <div>
              <strong>Começa com</strong>
              <p>Começa exatamente com este texto</p>
            </div>
          </label>

          <label className="pattern-type-option">
            <input
              type="radio"
              name="type"
              value="ENDS_WITH"
              checked={patternType === 'ENDS_WITH'}
              onChange={(e) => setPatternType(e.target.value)}
            />
            <div>
              <strong>Termina com</strong>
              <p>Termina exatamente com este texto</p>
            </div>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>Prioridade</label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="form-input"
          min="0"
        />
        <p className="form-hint">Maior número = maior prioridade</p>
      </div>

      <div className="modal-actions">
        <button onClick={onClose} className="secondary-button">Cancelar</button>
        <button onClick={() => createMutation.mutate()} className="primary-button" disabled={!pattern || createMutation.isPending}>
          Adicionar
        </button>
      </div>
    </div>
  );
};

const EditPatternForm = ({
  patternId,
  objectionId,
  pattern,
  onClose,
  onSuccess,
  onError,
}: {
  patternId: string;
  objectionId: string;
  pattern: Pattern | undefined;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) => {
  const [patternText, setPatternText] = useState(pattern?.pattern || '');
  const [patternType, setPatternType] = useState(pattern?.type || 'EXACT');
  const [priority, setPriority] = useState(pattern?.priority || 0);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return httpClient.request(`/platform/prospecting/objections/${objectionId}/patterns/${patternId}`, {
        method: 'PUT',
        body: JSON.stringify({ pattern: patternText, type: patternType, priority }),
        schema: patternSchema,
      });
    },
    onSuccess,
    onError: () => onError('Erro ao atualizar padrão'),
  });

  if (!pattern) return null;

  return (
    <div className="objection-patterns-card">
      <h3>Editar Padrão</h3>

      <div className="form-group">
        <label>Padrão</label>
        <input
          type="text"
          value={patternText}
          onChange={(e) => setPatternText(e.target.value)}
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label>Tipo de Correspondência</label>
        <select value={patternType} onChange={(e) => setPatternType(e.target.value)} className="form-input">
          {Object.entries(patternTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Prioridade</label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="form-input"
          min="0"
        />
      </div>

      <div className="modal-actions">
        <button onClick={onClose} className="secondary-button">Cancelar</button>
        <button onClick={() => updateMutation.mutate()} className="primary-button" disabled={updateMutation.isPending}>
          Salvar
        </button>
      </div>
    </div>
  );
};
