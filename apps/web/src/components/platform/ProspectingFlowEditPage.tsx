import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { stepTypeNames, actionTypeNames, patternTypeNames } from './prospecting-helpers.js';

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

type FlowEditorView =
  | { type: 'overview' }
  | { type: 'edit-step'; stepId: string }
  | { type: 'responses'; stepId: string }
  | { type: 'edit-response'; stepId: string; optionId: string }
  | { type: 'create-response'; stepId: string };

export const ProspectingFlowEditPage = ({
  flowId,
  onBack,
}: {
  flowId: string;
  onBack: () => void;
}) => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editorView, setEditorView] = useState<FlowEditorView>({ type: 'overview' });
  const [flowName, setFlowName] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowActive, setFlowActive] = useState(true);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState('MESSAGE_ONLY');

  const { data: flowData, isLoading, error, refetch: refetchFlow } = useQuery({
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
    mutationFn: async (data) => {
      const body: Record<string, unknown> = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      if (data.isActive !== undefined) body.isActive = data.isActive;
      return httpClient.request(`/platform/prospecting/flows/${flowId}`, {
        method: 'PUT',
        body,
        schema: flowListItemSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      setFeedback({ type: 'success', message: 'Fluxo atualizado' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => setFeedback({ type: 'error', message: 'Erro ao atualizar fluxo' }),
  });

  if (isLoading) {
    return (
      <div className="flow-editor-page">
        <div className="flow-editor-header">
          <button className="back-button" onClick={onBack}>← Voltar para fluxos</button>
          <div className="flow-editor-breadcrumb">Prospecção / Fluxos / Carregando...</div>
        </div>
        <div className="flow-editor-loading">Carregando fluxo...</div>
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="flow-editor-page">
        <div className="flow-editor-header">
          <button className="back-button" onClick={onBack}>← Voltar para fluxos</button>
          <div className="flow-editor-breadcrumb">Prospecção / Fluxos / Erro</div>
        </div>
        <div className="flow-editor-error">
          <p>Não foi possível carregar o fluxo.</p>
          <button className="primary-button" onClick={() => void refetchFlow()}>
            Tentar novamente
          </button>
          <button className="secondary-button" onClick={onBack} style={{ marginLeft: '0.5rem' }}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (editorView.type === 'edit-step') {
    return (
      <StepEditor
        stepId={editorView.stepId}
        flowId={flowId}
        flowName={flow.name}
        flow={flow}
        onClose={() => setEditorView({ type: 'overview' })}
        onFeedback={setFeedback}
      />
    );
  }

  if (editorView.type === 'responses') {
    const step = flow.steps.find((s) => s.publicId === editorView.stepId);
    if (step) {
      return (
        <OptionListPage
          step={step}
          flowId={flowId}
          flowName={flow.name}
          flow={flow}
          setEditorView={setEditorView}
          onClose={() => setEditorView({ type: 'overview' })}
          onFeedback={setFeedback}
        />
      );
    }
  }

  if (editorView.type === 'edit-response') {
    const step = flow.steps.find((s) => s.publicId === editorView.stepId);
    const option = step?.options.find((o) => o.publicId === editorView.optionId);
    if (step && option) {
      return (
        <ResponseEditorPage
          step={step}
          option={option}
          flowId={flowId}
          flowName={flow.name}
          flow={flow}
          onClose={() => setEditorView({ type: 'responses', stepId: step.publicId })}
          onFeedback={setFeedback}
        />
      );
    }
  }

  if (editorView.type === 'create-response') {
    const step = flow.steps.find((s) => s.publicId === editorView.stepId);
    if (step) {
      return (
        <ResponseCreatePage
          step={step}
          flowId={flowId}
          flowName={flow.name}
          flow={flow}
          onClose={() => setEditorView({ type: 'responses', stepId: step.publicId })}
          onFeedback={setFeedback}
        />
      );
    }
  }

  return (
    <div className="flow-editor-page">
      <div className="flow-editor-header">
        <button className="back-button" onClick={onBack}>← Voltar para fluxos</button>
        <div className="flow-editor-breadcrumb">Prospecção / Fluxos / Editar</div>
        <div className="flow-editor-status">
          {flow.code === 'DIRECTORY_PUBLICATION' && <span className="badge badge-default">Padrão</span>}
          <span className={`badge ${flow.isActive ? 'badge-active' : 'badge-inactive'}`}>
            {flow.isActive ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {feedback && <div className={`prospecting-feedback ${feedback.type}`}>{feedback.message}</div>}

      {/* Flow Info */}
      <div className="flow-info-card">
        <h2>{flow.name}</h2>
        {flow.description && <p className="flow-info-description">{flow.description}</p>}
        <div className="flow-info-meta">{flow.steps.length} etapas</div>
      </div>

      {/* Flow Settings */}
      <div className="flow-settings-card">
        <h3>Informações do Fluxo</h3>
        <div className="form-group">
          <label>Nome</label>
          <input
            type="text"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="form-input"
            placeholder="Nome do fluxo"
          />
        </div>

        <div className="form-group">
          <label>Descrição</label>
          <textarea
            value={flowDesc}
            onChange={(e) => setFlowDesc(e.target.value)}
            className="form-input"
            placeholder="Descrição breve do fluxo"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={flowActive}
              onChange={(e) => setFlowActive(e.target.checked)}
            />
            Ativo
          </label>
        </div>

        <button
          className="primary-button"
          onClick={() => updateFlowMutation.mutate({ name: flowName, description: flowDesc, isActive: flowActive })}
          disabled={updateFlowMutation.isPending}
        >
          Salvar Informações
        </button>
      </div>

      {/* Flow Steps */}
      <div className="flow-steps-card">
        <h3>Etapas do Fluxo</h3>

        {!flow || flow.steps.length === 0 ? (
          <div className="empty-state">Nenhuma etapa criada ainda</div>
        ) : (
          <div className="flow-steps-list">
            {flow.steps.map((step, idx) => (
              <FlowStepCard
                key={step.publicId}
                step={step}
                index={idx}
                flowId={flowId}
                onEdit={() => setEditorView({ type: 'edit-step', stepId: step.publicId })}
                onEditOptions={() => setEditorView({ type: 'responses', stepId: step.publicId })}
                onFeedback={setFeedback}
              />
            ))}
          </div>
        )}

        <button
          className="secondary-button"
          style={{ marginTop: '1rem' }}
          onClick={() => setShowAddStep(true)}
        >
          + Adicionar Etapa
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
              setFeedback({ type: 'success', message: 'Etapa adicionada' });
              setTimeout(() => setFeedback(null), 3000);
            }}
            onError={() => setFeedback({ type: 'error', message: 'Erro ao adicionar etapa' })}
            stepName={newStepName}
            stepType={newStepType}
            onNameChange={setNewStepName}
            onTypeChange={setNewStepType}
          />
        )}
      </div>

    </div>
  );
};

const variables = [
  { key: '{{estabelecimento}}', label: 'Estabelecimento' },
  { key: '{{endereco}}', label: 'Endereço' },
  { key: '{{cidade}}', label: 'Cidade' },
  { key: '{{estado}}', label: 'Estado' },
  { key: '{{telefone}}', label: 'Telefone' },
  { key: '{{link_atual}}', label: 'Link Atual' },
];

const FlowStepCard = ({
  step,
  index,
  flowId,
  onEdit,
  onEditOptions,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema>;
  index: number;
  flowId: string;
  onEdit: () => void;
  onEditOptions: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();

  return (
    <div className="flow-step-card">
      <div className="flow-step-header">
        <div className="flow-step-number">{index + 1}</div>
        <div className="flow-step-info">
          <h4 className="flow-step-title">
            {step.name}
            {step.isStart && <span className="badge badge-start">INÍCIO</span>}
          </h4>
          <p className="flow-step-type">{stepTypeNames[step.stepType]}</p>
        </div>
      </div>

      <p className="flow-step-message">{step.message}</p>

      {step.stepType === 'MESSAGE_OPTIONS' && step.options.length > 0 && (
        <div className="flow-step-responses">
          <strong>{step.options.length} resposta(s) configurada(s)</strong>
        </div>
      )}

      <div className="flow-step-actions">
        <button className="secondary-button" onClick={onEdit}>
          Editar Etapa
        </button>
        {step.stepType === 'MESSAGE_OPTIONS' && (
          <button className="secondary-button" onClick={onEditOptions}>
            Respostas
          </button>
        )}
        <button
          className="danger-button"
          onClick={() => {
            if (confirm('Excluir etapa? Esta ação não pode ser desfeita.')) {
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
        body: { name: stepName, stepType, message: '', position: pos, isStart: pos === 0 },
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
  flowName,
  flow,
  onClose,
  onFeedback,
}: {
  stepId: string;
  flowId: string;
  flowName: string;
  flow: z.infer<typeof flowDetailSchema>;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const [localFeedback, setLocalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const step = flow.steps.find((s) => s.publicId === stepId);
  const [name, setName] = useState(() => step?.name ?? '');
  const [message, setMessage] = useState(() => step?.message ?? '');
  const [isStart, setIsStart] = useState(() => step?.isStart ?? false);
  const [nextStepId, setNextStepId] = useState(() => step?.nextStepPublicId || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!step) return null;

  const showsNextStep = ['WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY'].includes(step.stepType);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { name, message, isStart };
      if (showsNextStep) body.nextStepId = nextStepId || undefined;
      return httpClient.request(`/platform/prospecting/flows/${flowId}/steps/${stepId}`, {
        method: 'PUT',
        body,
        schema: flowStepSchema,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      setLocalFeedback({ type: 'success', message: 'Etapa atualizada com sucesso' });
      setTimeout(() => onClose(), 1500);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar etapa';
      setLocalFeedback({ type: 'error', message });
    },
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
    <div className="flow-editor-page">
      <div className="flow-editor-header">
        <button onClick={onClose} className="back-button">
          ← Voltar ao fluxo
        </button>
        <div className="flow-editor-breadcrumb">
          Prospecção / Fluxos / {flowName} / Editar etapa
        </div>
      </div>

      <div className="flow-step-editor">
      <h2>Editar Etapa</h2>

      <div className="form-group">
        <label>Nome</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" placeholder="Nome" />
      </div>

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
        <button onClick={() => updateMutation.mutate()} className="primary-button" disabled={updateMutation.isPending}>
          Salvar alterações
        </button>
      </div>

      {localFeedback && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: localFeedback.type === 'success' ? 'var(--ds-background-positive-subtle)' : 'var(--ds-background-negative-subtle)',
          color: localFeedback.type === 'success' ? 'var(--ds-text-positive)' : 'var(--ds-text-negative)',
          borderRadius: '4px',
          fontSize: '0.9rem'
        }}>
          {localFeedback.type === 'success' ? '✓' : '✗'} {localFeedback.message}
        </div>
      )}
      </div>
    </div>
  );
};

type PatternView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; patternId: string };

const ResponseEditorPage = ({
  step,
  option,
  flowId,
  flowName,
  flow,
  onClose,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema>;
  option: z.infer<typeof flowOptionSchema>;
  flowId: string;
  flowName: string;
  flow: z.infer<typeof flowDetailSchema>;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(option.label);
  const [actionType, setActionType] = useState(option.actionType);
  const [nextStepId, setNextStepId] = useState(option.nextStepPublicId || '');
  const [patternView, setPatternView] = useState<PatternView>({ type: 'list' });
  const [patternText, setPatternText] = useState('');
  const [patternType, setPatternType] = useState('EXACT');
  const [priority, setPriority] = useState(0);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { label, actionType, position: option.position };
      if (actionType === 'NEXT_STEP') {
        body.nextStepPublicId = nextStepId || null;
      } else {
        body.nextStepPublicId = null;
      }
      return httpClient.request(`/platform/prospecting/flows/${flowId}/options/${option.publicId}`, {
        method: 'PUT',
        body,
        schema: flowOptionSchema,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Resposta atualizada' });
      onClose();
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao atualizar resposta' }),
  });

  const addPatternMutation = useMutation({
    mutationFn: async () => {
      return httpClient.request(
        `/platform/prospecting/flows/${flowId}/options/${option.publicId}/patterns`,
        {
          method: 'POST',
          body: { pattern: patternText, patternType, priority },
          schema: flowPatternSchema,
        }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      setPatternText('');
      setPatternType('EXACT');
      setPriority(0);
      setPatternView({ type: 'list' });
      onFeedback({ type: 'success', message: 'Padrão adicionado' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao adicionar padrão' }),
  });

  const deletePatternMutation = useMutation({
    mutationFn: (patternId: string) =>
      httpClient.request(
        `/platform/prospecting/flows/${flowId}/options/${option.publicId}/patterns/${patternId}`,
        { method: 'DELETE', schema: z.any() }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Padrão removido' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao remover padrão' }),
  });

  const editPatternMutation = useMutation({
    mutationFn: (patternId: string) =>
      httpClient.request(
        `/platform/prospecting/flows/${flowId}/options/${option.publicId}/patterns/${patternId}`,
        {
          method: 'PUT',
          body: { pattern: patternText, patternType, priority },
          schema: flowPatternSchema,
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      setPatternText('');
      setPatternType('EXACT');
      setPriority(0);
      setPatternView({ type: 'list' });
      onFeedback({ type: 'success', message: 'Padrão atualizado' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao atualizar padrão' }),
  });

  return (
    <div className="flow-editor-page">
      <div className="flow-editor-header">
        <button onClick={onClose} className="back-button">
          ← Voltar para respostas
        </button>
        <div className="flow-editor-breadcrumb">
          Prospecção / Fluxos / {flowName} / {step.name} / Editar resposta
        </div>
      </div>

      <div className="flow-step-editor">
        <h2>Editar Resposta</h2>

        <div className="form-group">
          <label>Texto da resposta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="form-input"
            placeholder="ex: Tenho interesse"
          />
        </div>

        <div className="form-group">
          <label>Ação</label>
          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              if (e.target.value !== 'NEXT_STEP') setNextStepId('');
            }}
            className="form-input"
          >
            {Object.entries(actionTypeNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {actionType === 'NEXT_STEP' && (
          <div className="form-group">
            <label>Próxima etapa *</label>
            <select value={nextStepId} onChange={(e) => setNextStepId(e.target.value)} className="form-input">
              <option value="">Escolha uma etapa</option>
              {flow.steps
                .filter((s) => s.publicId !== step.publicId)
                .map((s) => (
                  <option key={s.publicId} value={s.publicId}>
                    {s.name}
                  </option>
                ))}
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', marginTop: '0.5rem' }}>
              Escolha para qual etapa o fluxo seguirá.
            </p>
          </div>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--ds-border-neutral)' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
            Padrões de reconhecimento
          </h3>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--ds-text-secondary)' }}>
            Defina quais mensagens do lead correspondem a esta resposta.
          </p>

          {patternView.type === 'list' ? (
            <>
              {option.patterns.length === 0 ? (
                <div style={{ padding: '1rem', backgroundColor: 'var(--ds-background-secondary)', borderRadius: '6px', marginBottom: '1rem', color: 'var(--ds-text-tertiary)' }}>
                  Nenhum padrão configurado
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  {option.patterns.map((p) => (
                    <div key={p.id} style={{ padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid var(--ds-border-neutral)', borderRadius: '6px', backgroundColor: 'var(--ds-background-secondary)' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.25rem 0.5rem', backgroundColor: 'var(--ds-background-tertiary)', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 500 }}>
                          {patternTypeNames[p.patternType] || p.patternType}
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--ds-text-primary)' }}>{p.pattern}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-tertiary)' }}>Prioridade {p.priority}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setPatternText(p.pattern);
                              setPatternType(p.patternType);
                              setPriority(p.priority);
                              setPatternView({ type: 'edit', patternId: p.id });
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Editar
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => {
                              if (confirm('Remover padrão?')) {
                                deletePatternMutation.mutate(p.id);
                              }
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  setPatternText('');
                  setPatternType('EXACT');
                  setPriority(0);
                  setPatternView({ type: 'create' });
                }}
                style={{ width: '100%' }}
              >
                + Adicionar padrão
              </button>
            </>
          ) : patternView.type === 'create' || patternView.type === 'edit' ? (
            <>
              <div className="form-group">
                <label>Texto do padrão</label>
                <input
                  type="text"
                  value={patternText}
                  onChange={(e) => setPatternText(e.target.value)}
                  className="form-input"
                  placeholder="ex: sim"
                />
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={patternType} onChange={(e) => setPatternType(e.target.value)} className="form-input">
                  <option value="EXACT">Exato</option>
                  <option value="CONTAINS">Contém</option>
                  <option value="STARTS_WITH">Começa com</option>
                  <option value="ENDS_WITH">Termina com</option>
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
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="secondary-button" onClick={() => setPatternView({ type: 'list' })} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    if (patternView.type === 'create') {
                      addPatternMutation.mutate();
                    } else if (patternView.type === 'edit') {
                      editPatternMutation.mutate(patternView.patternId);
                    }
                  }}
                  disabled={!patternText || addPatternMutation.isPending || editPatternMutation.isPending}
                  style={{ flex: 1 }}
                >
                  {patternView.type === 'create' ? 'Adicionar padrão' : 'Salvar'}
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="flow-form-actions">
          <button onClick={onClose} className="secondary-button">
            Cancelar
          </button>
          <button
            onClick={() => updateMutation.mutate()}
            className="primary-button"
            disabled={updateMutation.isPending || (actionType === 'NEXT_STEP' && !nextStepId)}
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
};

const ResponseCreatePage = ({
  step,
  flowId,
  flowName,
  flow,
  onClose,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema>;
  flowId: string;
  flowName: string;
  flow: z.infer<typeof flowDetailSchema>;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [actionType, setActionType] = useState('NEXT_STEP');
  const [nextStepId, setNextStepId] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        label,
        actionType,
        position: step.options.length,
      };
      if (actionType === 'NEXT_STEP') {
        body.nextStepPublicId = nextStepId || null;
      } else {
        body.nextStepPublicId = null;
      }
      return httpClient.request(`/platform/prospecting/flows/${flowId}/steps/${step.publicId}/options`, {
        method: 'POST',
        body,
        schema: flowOptionSchema,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Resposta adicionada' });
      onClose();
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao adicionar resposta' }),
  });

  return (
    <div className="flow-editor-page">
      <div className="flow-editor-header">
        <button onClick={onClose} className="back-button">
          ← Voltar para respostas
        </button>
        <div className="flow-editor-breadcrumb">
          Prospecção / Fluxos / {flowName} / {step.name} / Nova resposta
        </div>
      </div>

      <div className="flow-step-editor">
        <h2>Adicionar Resposta</h2>

        <div className="form-group">
          <label>Texto da resposta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="form-input"
            placeholder="ex: Tenho interesse"
          />
        </div>

        <div className="form-group">
          <label>Ação</label>
          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              if (e.target.value !== 'NEXT_STEP') setNextStepId('');
            }}
            className="form-input"
          >
            {Object.entries(actionTypeNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {actionType === 'NEXT_STEP' && (
          <div className="form-group">
            <label>Próxima etapa *</label>
            <select value={nextStepId} onChange={(e) => setNextStepId(e.target.value)} className="form-input">
              <option value="">Escolha uma etapa</option>
              {flow.steps
                .filter((s) => s.publicId !== step.publicId)
                .map((s) => (
                  <option key={s.publicId} value={s.publicId}>
                    {s.name}
                  </option>
                ))}
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', marginTop: '0.5rem' }}>
              Escolha para qual etapa o fluxo seguirá.
            </p>
          </div>
        )}

        <div className="flow-form-actions">
          <button onClick={onClose} className="secondary-button">
            Cancelar
          </button>
          <button
            onClick={() => createMutation.mutate()}
            className="primary-button"
            disabled={!label || createMutation.isPending || (actionType === 'NEXT_STEP' && !nextStepId)}
          >
            Adicionar Resposta
          </button>
        </div>
      </div>
    </div>
  );
};

const OptionListPage = ({
  step,
  flowId,
  flowName,
  flow,
  setEditorView,
  onClose,
  onFeedback,
}: {
  step: z.infer<typeof flowStepSchema>;
  flowId: string;
  flowName: string;
  flow: z.infer<typeof flowDetailSchema>;
  setEditorView: (view: FlowEditorView) => void;
  onClose: () => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}) => {
  const queryClient = useQueryClient();

  const deleteOptionMutation = useMutation<unknown, Error, string>({
    mutationFn: (optionId: string) =>
      httpClient.request(`/platform/prospecting/flows/${flowId}/options/${optionId}`, {
        method: 'DELETE',
        schema: z.any(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting-flow', flowId] });
      onFeedback({ type: 'success', message: 'Resposta removida' });
    },
    onError: () => onFeedback({ type: 'error', message: 'Erro ao remover resposta' }),
  });

  return (
    <div className="flow-editor-page">
      <div className="flow-editor-header">
        <button onClick={onClose} className="back-button">
          ← Voltar ao fluxo
        </button>
        <div className="flow-editor-breadcrumb">
          Prospecção / Fluxos / {flowName} / {step.name} / Respostas
        </div>
      </div>

      <div className="flow-step-editor">
        <h2>Respostas da Etapa</h2>
        <p style={{ marginBottom: '1.5rem', color: 'var(--ds-text-secondary)' }}>
          Configure as opções que o lead pode escolher nesta etapa.
        </p>

        {step.options.length === 0 ? (
          <div className="empty-state">Nenhuma resposta configurada</div>
        ) : (
          <div style={{ marginBottom: '2rem' }}>
            {step.options.map((opt) => (
              <div
                key={opt.publicId}
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--ds-border-neutral)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--ds-background-secondary)',
                }}
              >
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginTop: '0.25rem' }}>
                    → {actionTypeNames[opt.actionType]}
                    {opt.nextStepPublicId && ` (${flow.steps.find((s) => s.publicId === opt.nextStepPublicId)?.name || 'Etapa'})`}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-tertiary)', marginBottom: '0.75rem' }}>
                  {opt.patterns.length} padrão(ões)
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="secondary-button"
                    onClick={() => setEditorView({ type: 'edit-response', stepId: step.publicId, optionId: opt.publicId })}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Editar
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (confirm('Remover resposta? Esta ação não pode ser desfeita.')) {
                        deleteOptionMutation.mutate(opt.publicId);
                      }
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--ds-border-neutral)', marginTop: '1.5rem' }}>
          <button
            onClick={() => setEditorView({ type: 'create-response', stepId: step.publicId })}
            className="primary-button"
          >
            + Adicionar Resposta
          </button>
        </div>
      </div>
    </div>
  );
};
