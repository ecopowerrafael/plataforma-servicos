import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import './prospecting-flows.css';

const stepTypeSchema = z.enum(['MESSAGE_OPTIONS', 'WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY', 'MANUAL', 'END']);
const actionTypeSchema = z.enum(['NEXT_STEP', 'END', 'MANUAL']);

const flowPatternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  patternType: z.string(),
  priority: z.number(),
});

const flowOptionSchema = z.object({
  publicId: z.string().uuid(),
  label: z.string(),
  actionType: actionTypeSchema,
  position: z.number(),
  nextStepPublicId: z.string().uuid().nullable(),
  patterns: z.array(flowPatternSchema).default([]),
});

const flowStepSchema = z.object({
  publicId: z.string().uuid(),
  name: z.string(),
  message: z.string(),
  stepType: stepTypeSchema,
  position: z.number(),
  isStart: z.boolean(),
  nextStepPublicId: z.string().uuid().nullable(),
  optionsCount: z.number().default(0),
  options: z.array(flowOptionSchema).default([]),
});

const flowDetailSchema = z.object({
  publicId: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  steps: z.array(flowStepSchema).default([]),
});

const flowListItemSchema = z.object({
  publicId: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  stepsCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const stepTypeNames: Record<string, string> = {
  MESSAGE_OPTIONS: 'Mensagem com respostas',
  WAIT_TEXT: 'Aguardar texto',
  WAIT_LINK: 'Aguardar link',
  MESSAGE_ONLY: 'Mensagem simples',
  MANUAL: 'Atendimento manual',
  END: 'Encerramento',
};

const actionTypeNames: Record<string, string> = {
  NEXT_STEP: 'Ir para outra etapa',
  END: 'Encerrar fluxo',
  MANUAL: 'Atendimento manual',
};

const variables = [
  { key: '{{estabelecimento}}', label: 'Estabelecimento' },
  { key: '{{endereco}}', label: 'Endereço' },
  { key: '{{cidade}}', label: 'Cidade' },
  { key: '{{estado}}', label: 'Estado' },
  { key: '{{telefone}}', label: 'Telefone' },
  { key: '{{link_atual}}', label: 'Link Atual' },
];

export const ProspectingFlowsView = () => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: ['prospecting-flows'],
    queryFn: async () => {
      const res = await httpClient.request('/platform/prospecting/flows', {
        schema: z.object({ items: z.array(flowListItemSchema) }),
      });
      return res.items;
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: async (data: { publicId: string; name?: string; description?: string; isActive?: boolean }) => {
      const body: Record<string, any> = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      if (data.isActive !== undefined) body.isActive = data.isActive;
      return httpClient.request(`/platform/prospecting/flows/${data.publicId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        schema: flowListItemSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
      setFeedback({ type: 'success', message: 'Fluxo atualizado' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => setFeedback({ type: 'error', message: 'Erro ao atualizar fluxo' }),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/flows/${publicId}`, { method: 'DELETE', schema: z.any() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
      setFeedback({ type: 'success', message: 'Fluxo removido' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => setFeedback({ type: 'error', message: 'Erro ao remover' }),
  });

  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Erro ao carregar'} />;
  if (isLoading) return <div className="prospecting-flows-container">Carregando...</div>;

  return (
    <div className="prospecting-flows-container">
      <div className="page-header">
        <h1>Fluxos de Prospecção</h1>
        <button className="primary-button" onClick={() => setShowNewModal(true)}>
          + Novo Fluxo
        </button>
      </div>

      {feedback && <div className={`prospecting-feedback ${feedback.type}`}>{feedback.message}</div>}

      {flows.length === 0 ? (
        <div className="prospecting-empty-state">Nenhum fluxo criado ainda</div>
      ) : (
        <div className="prospecting-flows-grid">
          {flows.map((flow) => (
            <div key={flow.publicId} className="prospecting-flow-card">
              <div className="flow-card-header">
                <div className="flow-card-title">
                  <h3>{flow.name}</h3>
                  {flow.code === 'DIRECTORY_PUBLICATION' && <span className="flow-badge-default">Padrão</span>}
                  <span className={`flow-badge-status ${flow.isActive ? 'active' : 'inactive'}`}>
                    {flow.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flow-card-actions">
                  <button className="secondary-button" onClick={() => setEditingFlowId(flow.publicId)}>
                    Editar
                  </button>
                  <button className="secondary-button" onClick={() => updateFlowMutation.mutate({ publicId: flow.publicId, isActive: !flow.isActive })}>
                    {flow.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  {flow.code !== 'DIRECTORY_PUBLICATION' && (
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (confirm('Tem certeza?')) deleteFlowMutation.mutate(flow.publicId);
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
              {flow.description && <p className="flow-card-description">{flow.description}</p>}
              <p className="flow-card-meta">{flow.stepsCount} etapa(s)</p>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewFlowModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            setShowNewModal(false);
            queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
            setFeedback({ type: 'success', message: 'Fluxo criado' });
            setTimeout(() => setFeedback(null), 3000);
          }}
          onError={(msg) => setFeedback({ type: 'error', message: msg })}
        />
      )}

      {editingFlowId && (
        <FlowEditor
          flowId={editingFlowId}
          onClose={() => setEditingFlowId(null)}
          onFeedback={setFeedback}
        />
      )}
    </div>
  );
};

const NewFlowModal = ({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const createMutation = useMutation({
    mutationFn: async () => {
      return httpClient.request('/platform/prospecting/flows', {
        method: 'POST',
        body: JSON.stringify({ name, description, isActive }),
        schema: flowListItemSchema,
      });
    },
    onSuccess,
    onError: () => onError('Erro ao criar fluxo'),
  });

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Fluxo</h2>
        <input type="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
        <textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" />
        <label className="form-checkbox">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Ativo
        </label>
        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">
            Cancelar
          </button>
          <button onClick={() => createMutation.mutate()} className="primary-button" disabled={!name}>
            Criar
          </button>
        </div>
      </div>
    </div>
  );
};

const FlowEditor = ({
  flowId,
  onClose,
  onFeedback,
}: {
  flowId: string;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowActive, setFlowActive] = useState(true);

  const { data: flow } = useQuery({
    queryKey: ['prospecting-flow', flowId],
    queryFn: async () => {
      return httpClient.request(`/platform/prospecting/flows/${flowId}`, { schema: flowDetailSchema });
    },
    onSuccess: (data) => {
      setFlowName(data.name);
      setFlowDesc(data.description || '');
      setFlowActive(data.isActive);
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string; isActive?: boolean }) => {
      const body: Record<string, any> = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      if (data.isActive !== undefined) body.isActive = data.isActive;
      return httpClient.request(`/platform/prospecting/flows/${flowId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        schema: flowListItemSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Fluxo atualizado' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao atualizar' }),
  });

  if (!flow) return null;

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <button onClick={onClose} className="drawer-close">
          ← Voltar
        </button>

        <div className="flow-editor-section">
          <h2>Dados do Fluxo</h2>
          <input type="text" value={flowName} onChange={(e) => setFlowName(e.target.value)} className="form-input" placeholder="Nome" />
          <textarea value={flowDesc} onChange={(e) => setFlowDesc(e.target.value)} className="form-input" placeholder="Descrição" />
          <label className="form-checkbox">
            <input type="checkbox" checked={flowActive} onChange={(e) => setFlowActive(e.target.checked)} />
            Ativo
          </label>
          <button
            className="primary-button"
            onClick={() => updateFlowMutation.mutate({ name: flowName, description: flowDesc, isActive: flowActive })}
          >
            Salvar Informações
          </button>
        </div>

        <div className="flow-editor-section">
          <h2>Etapas</h2>
          {flow.steps.length === 0 ? (
            <div className="empty-state">Nenhuma etapa criada ainda</div>
          ) : (
            <div className="steps-list">
              {flow.steps.map((step, idx) => (
                <StepCard
                  key={step.publicId}
                  step={step}
                  flowId={flowId}
                  index={idx}
                  onEdit={() => setEditingStepId(step.publicId)}
                  onOptionEdit={() => setEditingOptionId(step.publicId)}
                  onFeedback={onFeedback}
                />
              ))}
            </div>
          )}
          <button
            className="secondary-button"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              const name = prompt('Nome da etapa');
              if (name) {
                const type = prompt('Tipo (MESSAGE_OPTIONS, WAIT_TEXT, etc)') || 'MESSAGE_ONLY';
                const pos = flow.steps.length;
                httpClient
                  .request(`/platform/prospecting/flows/${flowId}/steps`, {
                    method: 'POST',
                    body: JSON.stringify({ name, stepType: type, message: '', position: pos, isStart: pos === 0 }),
                    schema: flowStepSchema,
                  })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
                    onFeedback({ type: 'success', message: 'Etapa adicionada' });
                  })
                  .catch(() => onFeedback({ type: 'error', message: 'Erro ao adicionar etapa' }));
              }
            }}
          >
            + Adicionar etapa
          </button>
        </div>

        {editingStepId && (
          <StepEditor
            stepId={editingStepId}
            flowId={flowId}
            flow={flow}
            onClose={() => setEditingStepId(null)}
            onFeedback={onFeedback}
          />
        )}
      </div>
    </div>
  );
};

const StepCard = ({
  step,
  flowId,
  index,
  onEdit,
  onOptionEdit,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema>;
  flowId: string;
  index: number;
  onEdit: () => void;
  onOptionEdit: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();

  return (
    <div className="step-card">
      <div className="step-card-header">
        <div>
          <div className="step-title">
            Etapa {index + 1}: {step.name}
            {step.isStart && <span className="step-badge-start">INÍCIO</span>}
          </div>
          <div className="step-type">{stepTypeNames[step.stepType]}</div>
        </div>
        <div className="step-card-actions">
          <button className="secondary-button" onClick={onEdit}>
            Editar
          </button>
          <button
            className="danger-button"
            onClick={() => {
              if (confirm('Excluir etapa?')) {
                httpClient
                  .request(`/platform/prospecting/flows/${flowId}/steps/${step.publicId}`, {
                    method: 'DELETE',
                    schema: z.any(),
                  })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
                    onFeedback({ type: 'success', message: 'Etapa removida' });
                  })
                  .catch(() => onFeedback({ type: 'error', message: 'Erro ao remover etapa' }));
              }
            }}
          >
            Excluir
          </button>
        </div>
      </div>

      <p className="step-message">{step.message}</p>

      {step.stepType === 'MESSAGE_OPTIONS' && (
        <div className="options-section">
          <div className="section-title">Respostas Possíveis</div>
          {step.options.length === 0 ? (
            <div className="empty-state">Nenhuma resposta configurada</div>
          ) : (
            <div className="options-list">
              {step.options.map((opt) => (
                <div key={opt.publicId} className="option-card">
                  <div className="option-label">{opt.label}</div>
                  <div className="option-action">{actionTypeNames[opt.actionType]}</div>
                  {opt.patterns.length > 0 && <div className="option-patterns">{opt.patterns.length} padrão(ões)</div>}
                </div>
              ))}
            </div>
          )}
          <button className="secondary-button" style={{ marginTop: '0.5rem' }} onClick={onOptionEdit}>
            + Adicionar resposta
          </button>
        </div>
      )}

      {step.stepType === 'WAIT_LINK' && (
        <div className="wait-link-info">
          <div className="section-title">🔗 Aguardar Link</div>
          {step.nextStepPublicId && <div>→ Próxima etapa após link</div>}
        </div>
      )}

      {step.stepType === 'END' && <div className="end-badge">Encerramento do fluxo</div>}
      {step.stepType === 'MANUAL' && <div className="manual-badge">A partir daqui, assumir manualmente</div>}
    </div>
  );
};

const StepEditor = ({
  stepId,
  flowId,
  flow,
  onClose,
  onFeedback,
}: {
  stepId: string;
  flowId: string;
  flow: z.infer<typeof flowDetailSchema>;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const step = flow.steps.find((s) => s.publicId === stepId);
  if (!step) return null;

  const [name, setName] = useState(step.name);
  const [message, setMessage] = useState(step.message);
  const [isStart, setIsStart] = useState(step.isStart);
  const [nextStepId, setNextStepId] = useState(step.nextStepPublicId || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showsNextStep = ['WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY'].includes(step.stepType);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { name, message };
      if (showsNextStep) body.nextStepId = nextStepId || undefined;
      if (isStart) body.isStart = true;
      return httpClient.request(`/platform/prospecting/flows/${flowId}/steps/${stepId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        schema: flowStepSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Etapa atualizada' });
      onClose();
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao atualizar' }),
  });

  const insertVariable = (varKey: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newMsg = message.substring(0, start) + varKey + message.substring(end);
      setMessage(newMsg);
      setTimeout(() => {
        textareaRef.current!.selectionStart = textareaRef.current!.selectionEnd = start + varKey.length;
        textareaRef.current!.focus();
      }, 0);
    }
  };

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">
          ← Voltar
        </button>
        <h2>Editar Etapa: {step.name}</h2>

        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" placeholder="Nome" />

        <div className="form-group">
          <label>Tipo</label>
          <div className="form-value">{stepTypeNames[step.stepType]}</div>
        </div>

        <div className="form-group">
          <label>Mensagem</label>
          <textarea ref={textareaRef} value={message} onChange={(e) => setMessage(e.target.value)} className="form-input" rows={4} />
          <div className="variables-section">
            <small>As variáveis serão substituídas pelos dados do lead durante o envio:</small>
            <div className="variables-chips">
              {variables.map((v) => (
                <button
                  key={v.key}
                  className="variable-chip"
                  onClick={() => insertVariable(v.key)}
                  type="button"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showsNextStep && (
          <div className="form-group">
            <label>Próxima etapa automática</label>
            <select value={nextStepId} onChange={(e) => setNextStepId(e.target.value)} className="form-input">
              <option value="">Nenhuma</option>
              {flow.steps
                .filter((s) => s.publicId !== stepId)
                .map((s) => (
                  <option key={s.publicId} value={s.publicId}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <label className="form-checkbox">
          <input type="checkbox" checked={isStart} onChange={(e) => setIsStart(e.target.checked)} />
          Esta é a etapa inicial
        </label>

        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">
            Cancelar
          </button>
          <button onClick={() => updateMutation.mutate()} className="primary-button">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};