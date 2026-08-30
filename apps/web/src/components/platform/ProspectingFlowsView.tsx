import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { stepTypeNames } from './prospecting-helpers.js';
import { ProspectingFlowEditPage } from './ProspectingFlowEditPage.js';
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
  { key: '{{endereco}}', label: 'EndereÃ§o' },
  { key: '{{cidade}}', label: 'Cidade' },
  { key: '{{estado}}', label: 'Estado' },
  { key: '{{telefone}}', label: 'Telefone' },
  { key: '{{link_atual}}', label: 'Link Atual' },
];

type FlowView = { type: 'list' } | { type: 'edit'; flowId: string } | { type: 'create' };

export const ProspectingFlowsView = () => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [view, setView] = useState<FlowView>({ type: 'list' });

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

  if (view.type === 'edit') {
    return (
      <ProspectingFlowEditPage
        flowId={view.flowId}
        onBack={() => {
          setView({ type: 'list' });
          queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
        }}
      />
    );
  }

  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Erro ao carregar'} />;
  if (isLoading) return <div className="prospecting-flows-container">Carregando...</div>;

  return (
    <div className="prospecting-flows-container">
      <div className="page-header">
        <h1>Fluxos de ProspecÃ§Ã£o</h1>
        <button className="primary-button" onClick={() => setView({ type: 'create' })}>
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
                  {flow.code === 'DIRECTORY_PUBLICATION' && <span className="flow-badge-default">PadrÃ£o</span>}
                  <span className={`flow-badge-status ${flow.isActive ? 'active' : 'inactive'}`}>
                    {flow.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flow-card-actions">
                  <button className="secondary-button" onClick={() => setView({ type: 'edit', flowId: flow.publicId })}>
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

      {view.type === 'create' && (
        <NewFlowModal
          onClose={() => setView({ type: 'list' })}
          onSuccess={() => {
            setView({ type: 'list' });
            queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
            setFeedback({ type: 'success', message: 'Fluxo criado' });
            setTimeout(() => setFeedback(null), 3000);
          }}
          onError={(msg) => setFeedback({ type: 'error', message: msg })}
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
        <textarea placeholder="DescriÃ§Ã£o" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" />
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
