import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { stepTypeNames, actionTypeNames, patternTypeNames } from './prospecting-helpers.js';
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

  const updateFlowMutation = useMutation<
    z.infer<typeof flowListItemSchema>,
    Error,
    { publicId: string; name?: string; description?: string; isActive?: boolean }
  >({
    mutationFn: async (data: { publicId: string; name?: string; description?: string; isActive?: boolean }) => {
      const body: Record<string, unknown> = {};
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

  const deleteFlowMutation = useMutation<unknown, Error, string>({
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
  const [editingOptionStepId, setEditingOptionStepId] = useState<string | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState('MESSAGE_ONLY');
  const [flowName, setFlowName] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowActive, setFlowActive] = useState(true);

  const { data: flowData } = useQuery<z.infer<typeof flowDetailSchema>, Error, z.infer<typeof flowDetailSchema>, string[]>({
    queryKey: ['prospecting-flow', flowId],
    queryFn: async () => {
      return httpClient.request(`/platform/prospecting/flows/${flowId}`, { schema: flowDetailSchema });
    },
  });

  const flow = flowData || null;

  useEffect(() => {
    if (flow) {
      setFlowName(flow.name);
      setFlowDesc(flow.description || '');
      setFlowActive(flow.isActive);
    }
  }, [flow]);

  const updateFlowMutation = useMutation<
    z.infer<typeof flowListItemSchema>,
    Error,
    { name?: string; description?: string; isActive?: boolean }
  >({
    mutationFn: async (data: { name?: string; description?: string; isActive?: boolean }) => {
      const body: Record<string, unknown> = {};
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
          {!flow || flow.steps.length === 0 ? (
            <div className="empty-state">Nenhuma etapa criada ainda</div>
          ) : (
            <div className="steps-list">
              {flow && flow.steps.map((step: z.infer<typeof flowStepSchema>, idx: number) => (
                <StepCard
                  key={step.publicId}
                  step={step}
                  flowId={flowId}
                  index={idx}
                  onEdit={() => setEditingStepId(step.publicId)}
                  onOptionEdit={() => setEditingOptionStepId(step.publicId)}
                  onFeedback={onFeedback}
                />
              ))}
            </div>
          )}
          <button className="secondary-button" style={{ marginTop: '1rem' }} onClick={() => setShowAddStep(true)}>
            + Adicionar etapa
          </button>

          {showAddStep && (
            <AddStepModal
              flowId={flowId}
              flow={flow}
              onClose={() => {
                setShowAddStep(false);
                setNewStepName('');
                setNewStepType('MESSAGE_ONLY');
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
                setShowAddStep(false);
                setNewStepName('');
                setNewStepType('MESSAGE_ONLY');
                onFeedback({ type: 'success', message: 'Etapa adicionada' });
              }}
              onError={() => onFeedback({ type: 'error', message: 'Erro ao adicionar etapa' })}
              stepName={newStepName}
              stepType={newStepType}
              onNameChange={setNewStepName}
              onTypeChange={setNewStepType}
            />
          )}
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

        {editingOptionStepId && flow && (
          <OptionListEditor
            step={flow.steps.find((s: any) => s.publicId === editingOptionStepId)}
            flowId={flowId}
            onClose={() => setEditingOptionStepId(null)}
            onFeedback={onFeedback}
          />
        )}
      </div>
    </div>
  );
};

const OptionListEditor = ({
  step,
  flowId,
  onClose,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema> | undefined;
  flowId: string;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();
  const { data: flowData } = useQuery<z.infer<typeof flowDetailSchema>, Error, z.infer<typeof flowDetailSchema>, string[]>({
    queryKey: ['prospecting-flow', flowId],
    queryFn: async () => {
      return httpClient.request(`/platform/prospecting/flows/${flowId}`, { schema: flowDetailSchema });
    },
  });
  const flow = flowData;
  const [newLabel, setNewLabel] = useState('');
  const [newAction, setNewAction] = useState('NEXT_STEP');
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [patternsOptionId, setPatternsOptionId] = useState<string | null>(null);

  if (!step) return null;

  const addOptionMutation = useMutation<z.infer<typeof flowOptionSchema>, Error>({
    mutationFn: async () => {
      return httpClient.request(`/platform/prospecting/flows/${flowId}/steps/${step.publicId}/options`, {
        method: 'POST',
        body: JSON.stringify({ label: newLabel, actionType: newAction, position: step.options.length, nextStepPublicId: null }),
        schema: flowOptionSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      setNewLabel('');
      setNewAction('NEXT_STEP');
      onFeedback({ type: 'success', message: 'Resposta adicionada' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao adicionar resposta' }),
  });

  const deleteOptionMutation = useMutation<unknown, Error, string>({
    mutationFn: (optionId: string) =>
      httpClient.request(`/platform/prospecting/flows/${flowId}/options/${optionId}`, {
        method: 'DELETE',
        schema: z.any(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Resposta removida' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao remover resposta' }),
  });

  const editingOption = step.options.find(o => o.publicId === editingOptionId);

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">← Voltar</button>
        <h2>Respostas: {step.name}</h2>

        {step.options.length === 0 ? (
          <div className="empty-state">Nenhuma resposta configurada</div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            {step.options.map((opt) => (
              <div key={opt.publicId} className="option-card" style={{ marginBottom: '0.75rem', padding: '0.75rem', border: '1px solid var(--ds-border-neutral)', borderRadius: '3px' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="option-label">{opt.label}</div>
                  <div className="option-action" style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginTop: '0.25rem' }}>{actionTypeNames[opt.actionType]}</div>
                </div>
                {opt.patterns.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-tertiary)', marginBottom: '0.5rem' }}>
                    {opt.patterns.length} padrão(ões) configurado(s)
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="secondary-button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => setEditingOptionId(opt.publicId)}>
                    ✎ Editar
                  </button>
                  <button className="secondary-button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => setPatternsOptionId(opt.publicId)}>
                    🔍 Padrões
                  </button>
                  <button className="danger-button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => deleteOptionMutation.mutate(opt.publicId)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--ds-border-neutral)' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Nova resposta</label>
          <input type="text" placeholder="Texto da resposta" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="form-input" />
          <select value={newAction} onChange={(e) => setNewAction(e.target.value)} className="form-input">
            {Object.entries(actionTypeNames).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
          <button onClick={() => addOptionMutation.mutate()} className="primary-button" disabled={!newLabel} style={{ width: '100%' }}>
            Adicionar
          </button>
        </div>
      </div>

      {editingOption && flow && (
        <OptionEditor
          option={editingOption}
          steps={flow.steps}
          flowId={flowId}
          onClose={() => setEditingOptionId(null)}
          onSuccess={() => {
            setEditingOptionId(null);
            queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
            onFeedback({ type: 'success', message: 'Resposta atualizada' });
          }}
        />
      )}

      {patternsOptionId && step.options.find(o => o.publicId === patternsOptionId) && (
        <PatternListEditor
          option={step.options.find(o => o.publicId === patternsOptionId)!}
          flowId={flowId}
          onClose={() => setPatternsOptionId(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
            onFeedback({ type: 'success', message: 'Padrão adicionado' });
          }}
        />
      )}
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

const AddStepModal = ({
  flowId,
  flow,
  onClose,
  onSuccess,
  onError,
  stepName,
  stepType,
  onNameChange,
  onTypeChange,
}: {
  flowId: string;
  flow: z.infer<typeof flowDetailSchema> | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: () => void;
  stepName: string;
  stepType: string;
  onNameChange: (name: string) => void;
  onTypeChange: (type: string) => void;
}) => {
  const createMutation = useMutation({
    mutationFn: async () => {
      const pos = flow?.steps?.length || 0;
      return httpClient.request(`/platform/prospecting/flows/${flowId}/steps`, {
        method: 'POST',
        body: JSON.stringify({ name: stepName, stepType, message: '', position: pos, isStart: pos === 0 }),
        schema: flowStepSchema,
      });
    },
    onSuccess,
    onError,
  });

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">← Voltar</button>
        <h2>Adicionar Etapa</h2>
        <input type="text" placeholder="Nome" value={stepName} onChange={(e) => onNameChange(e.target.value)} className="form-input" />
        <select value={stepType} onChange={(e) => onTypeChange(e.target.value)} className="form-input">
          {Object.entries(stepTypeNames).map(([key, name]) => (
            <option key={key} value={key}>{name}</option>
          ))}
        </select>
        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">Cancelar</button>
          <button onClick={() => createMutation.mutate()} className="primary-button" disabled={!stepName}>Criar</button>
        </div>
      </div>
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
const OptionEditor = ({
  option,
  steps,
  flowId,
  onClose,
  onSuccess,
}: {
  option: z.infer<typeof flowOptionSchema>;
  steps: z.infer<typeof flowStepSchema>[];
  flowId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [label, setLabel] = useState<string>(option.label);
  const [action, setAction] = useState<string>(option.actionType);
  const [nextStep, setNextStep] = useState<string>(option.nextStepPublicId || '');

  const updateMutation = useMutation<z.infer<typeof flowOptionSchema>, Error>({
    mutationFn: async () => {
      const body: Record<string, unknown> = { label, actionType: action, position: option.position };
      if (action === 'NEXT_STEP') {
        body.nextStepPublicId = nextStep || null;
      } else {
        body.nextStepPublicId = null;
      }
      return httpClient.request(`/platform/prospecting/flows/${flowId}/options/${option.publicId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        schema: flowOptionSchema,
      });
    },
    onSuccess,
  });

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">← Voltar</button>
        <h2>Editar Resposta</h2>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="form-input" />
        <select value={action} onChange={(e) => {
          setAction(e.target.value);
          if (e.target.value !== 'NEXT_STEP') setNextStep('');
        }} className="form-input">
          {Object.entries(actionTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {action === 'NEXT_STEP' && (
          <select value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="form-input">
            <option value="">Nenhuma</option>
            {steps.map((s) => <option key={s.publicId} value={s.publicId}>{s.name}</option>)}
          </select>
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">Cancelar</button>
          <button onClick={() => updateMutation.mutate()} className="primary-button">Salvar</button>
        </div>
      </div>
    </div>
  );
};

const PatternListEditor = ({
  option,
  flowId,
  onClose,
  onSuccess,
}: {
  option: z.infer<typeof flowOptionSchema>;
  flowId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState('EXACT');
  const [priority, setPriority] = useState(10);
  const [editingPatternId, setEditingPatternId] = useState<string | null>(null);

  const addMutation = useMutation<z.infer<typeof flowPatternSchema>, Error>({
    mutationFn: async () => {
      return httpClient.request(`/platform/prospecting/flows/${flowId}/options/${option.publicId}/patterns`, {
        method: 'POST',
        body: JSON.stringify({ pattern, patternType: type, priority }),
        schema: flowPatternSchema,
      });
    },
    onSuccess: () => {
      onSuccess();
      setPattern('');
      setPriority(10);
    },
  });

  const deletePatternMutation = useMutation<unknown, Error, string>({
    mutationFn: (patternId: string) =>
      httpClient.request(`/platform/prospecting/flows/${flowId}/options/${option.publicId}/patterns/${patternId}`, {
        method: 'DELETE',
        schema: z.any(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onSuccess();
    },
  });

  const editingPattern = option.patterns.find(p => p.id === editingPatternId);

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">← Voltar</button>
        <h2>Padrões: {option.label}</h2>

        {option.patterns.length === 0 ? (
          <div className="empty-state" style={{ marginBottom: '1rem' }}>Nenhuma forma de reconhecimento configurada</div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            {option.patterns.map((p) => (
              <div key={p.id} className="option-card" style={{ marginBottom: '0.75rem', padding: '0.75rem', border: '1px solid var(--ds-border-neutral)', borderRadius: '3px' }}>
                <div style={{ marginBottom: '0.25rem' }}>
                  <strong>{p.pattern}</strong>
                </div>
                <div className="option-action" style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)' }}>{patternTypeNames[p.patternType]}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-tertiary)', marginTop: '0.25rem' }}>Prioridade: {p.priority}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="secondary-button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => setEditingPatternId(p.id)}>
                    ✎ Editar
                  </button>
                  <button className="danger-button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => {
                    if (confirm('Remover padrão?')) deletePatternMutation.mutate(p.id);
                  }}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--ds-border-neutral)' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Novo padrão</label>
          <input type="text" placeholder="Texto do padrão" value={pattern} onChange={(e) => setPattern(e.target.value)} className="form-input" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="form-input">
            {Object.entries(patternTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Prioridade (maior = mais importante)</label>
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="form-input" />
          </div>
          <button onClick={() => addMutation.mutate()} className="primary-button" disabled={!pattern} style={{ width: '100%' }}>
            Adicionar Padrão
          </button>
        </div>
      </div>

      {editingPattern && (
        <PatternEditor
          pattern={editingPattern}
          flowId={flowId}
          optionPublicId={option.publicId}
          onClose={() => setEditingPatternId(null)}
          onSuccess={() => {
            setEditingPatternId(null);
            queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
            onSuccess();
          }}
        />
      )}
    </div>
  );
};

const PatternEditor = ({
  pattern,
  flowId,
  optionPublicId,
  onClose,
  onSuccess,
}: {
  pattern: z.infer<typeof flowPatternSchema>;
  flowId: string;
  optionPublicId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [patternText, setPatternText] = useState<string>(pattern.pattern);
  const [patternType, setPatternType] = useState<string>(pattern.patternType);
  const [priority, setPriority] = useState<number>(pattern.priority);

  const updateMutation = useMutation<z.infer<typeof flowPatternSchema>, Error>({
    mutationFn: async () => {
      return httpClient.request(
        `/platform/prospecting/flows/${flowId}/options/${optionPublicId}/patterns/${pattern.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ pattern: patternText, patternType, priority }),
          schema: flowPatternSchema,
        }
      );
    },
    onSuccess,
  });

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">← Voltar</button>
        <h2>Editar Padrão</h2>
        <input
          type="text"
          value={patternText}
          onChange={(e) => setPatternText(e.target.value)}
          className="form-input"
          placeholder="Texto do padrão"
        />
        <select value={patternType} onChange={(e) => setPatternType(e.target.value)} className="form-input">
          {Object.entries(patternTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Prioridade</label>
          <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="form-input" />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">Cancelar</button>
          <button onClick={() => updateMutation.mutate()} className="primary-button">Salvar</button>
        </div>
      </div>
    </div>
  );
};
