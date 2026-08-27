import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import './prospecting-flows.css';

const flowListItemSchema = z.object({
  publicId: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  stepsCount: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const flowsResponseSchema = z.object({ items: z.array(flowListItemSchema) });

const stepTypeNames: Record<string, string> = {
  MESSAGE_OPTIONS: 'Mensagem com respostas',
  WAIT_TEXT: 'Aguardar texto',
  WAIT_LINK: 'Aguardar link',
  MESSAGE_ONLY: 'Mensagem simples',
  MANUAL: 'Atendimento manual',
  END: 'Encerramento',
};

export const ProspectingFlowsView = () => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: ['prospecting-flows'],
    queryFn: async () => {
      const res = await httpClient.request('/platform/prospecting/flows', {
        schema: flowsResponseSchema,
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
    onError: () => {
      setFeedback({ type: 'error', message: 'Erro ao atualizar fluxo' });
    },
  });

  const deleteFlowMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/flows/${publicId}`, { method: 'DELETE', schema: z.object({ success: z.boolean() }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
      setFeedback({ type: 'success', message: 'Fluxo removido' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => {
      setFeedback({ type: 'error', message: 'Não foi possível remover o fluxo' });
    },
  });

  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Erro ao carregar fluxos'} />;
  if (isLoading) return <div className="prospecting-flows-container">Carregando...</div>;

  return (
    <div className="prospecting-flows-container">
      <div className="page-header">
        <h1>Fluxos de Prospecção</h1>
        <button className="primary-button" onClick={() => setShowNewModal(true)}>
          + Novo Fluxo
        </button>
      </div>

      {feedback && (
        <div className={`prospecting-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {flows.length === 0 ? (
        <div className="prospecting-empty-state">Nenhum fluxo criado ainda</div>
      ) : (
        <div className="prospecting-flows-grid">
          {flows.map((flow) => (
            <div key={flow.publicId} className="prospecting-flow-card">
              <div className="flow-card-header">
                <div className="flow-card-title">
                  <h3>{flow.name}</h3>
                  {flow.code === 'DIRECTORY_PUBLICATION' && <span className="flow-badge-default">Fluxo padrão</span>}
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
                        if (confirm('Tem certeza que deseja remover este fluxo?')) {
                          deleteFlowMutation.mutate(flow.publicId);
                        }
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
        />
      )}

      {editingFlowId && <FlowEditor flowId={editingFlowId} onClose={() => setEditingFlowId(null)} />}
    </div>
  );
};

const NewFlowModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => {
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
    onSuccess: onSuccess,
  });

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Fluxo</h2>
        <input type="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
        <textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" />
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Ativo
        </label>
        <div className="modal-actions">
          <button onClick={onClose} className="secondary-button">
            Cancelar
          </button>
          <button onClick={() => createMutation.mutate()} className="primary-button">
            Criar
          </button>
        </div>
      </div>
    </div>
  );
};

const FlowEditor = ({ flowId, onClose }: { flowId: string; onClose: () => void }) => {
  const { data: flow } = useQuery({
    queryKey: ['prospecting-flow', flowId],
    queryFn: async () => {
      const res = await httpClient.request(`/platform/prospecting/flows/${flowId}`, {
        schema: z.any(),
      });
      return res;
    },
  });

  if (!flow) return null;

  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="drawer-close">
          ← Voltar
        </button>
        <h2>{flow.name}</h2>
        <p className="meta-text">{flow.steps?.length || 0} etapa(s)</p>

        {flow.steps?.map((step: any, idx: number) => (
          <div key={step.publicId} className="step-card">
            <div className="step-title">
              Etapa {idx + 1}: {step.name}
              {step.isStart && <span className="step-badge-start">INÍCIO</span>}
            </div>
            <div className="step-type">{stepTypeNames[step.stepType] || step.stepType}</div>
            {step.options?.length > 0 && <div className="step-meta">{step.options.length} resposta(s)</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
