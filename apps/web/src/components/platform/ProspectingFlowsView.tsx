import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';

const FlowDTO = z.object({
  publicId: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  stepsCount: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

type Flow = z.infer<typeof FlowDTO>;

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

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['prospecting-flows'],
    queryFn: async () => {
      const res = await httpClient.request('GET', '/platform/prospecting/flows');
      const parsed = z.object({ items: z.array(FlowDTO) }).parse(res);
      return parsed.items;
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: async (data: { publicId: string; name?: string; description?: string; isActive?: boolean }) => {
      return httpClient.request('PUT', `/platform/prospecting/flows/${data.publicId}`, {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
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
    mutationFn: (publicId: string) => httpClient.request('DELETE', `/platform/prospecting/flows/${publicId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-flows'] });
      setFeedback({ type: 'success', message: 'Fluxo removido' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => {
      setFeedback({ type: 'error', message: 'Não foi possível remover o fluxo' });
    },
  });

  if (isLoading) return <div className="p-4">Carregando fluxos...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Fluxos de Prospecção</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Novo Fluxo</button>
      </div>

      {feedback && (
        <div className={`p-4 rounded mb-4 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {feedback.message}
        </div>
      )}

      <div className="grid gap-4">
        {flows.map((flow) => (
          <div key={flow.publicId} className="border rounded-lg p-4 hover:shadow-lg transition">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{flow.name}</h2>
                  {flow.code === 'DIRECTORY_PUBLICATION' && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Fluxo padrão</span>}
                  <span className={`px-2 py-1 text-xs rounded ${flow.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {flow.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {flow.description && <p className="text-gray-600 text-sm mt-1">{flow.description}</p>}
                <p className="text-gray-500 text-xs mt-2">{flow.stepsCount} etapa(s)</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingFlowId(flow.publicId)} className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                  Editar
                </button>
                <button onClick={() => updateFlowMutation.mutate({ publicId: flow.publicId, isActive: !flow.isActive })} className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600">
                  {flow.isActive ? 'Desativar' : 'Ativar'}
                </button>
                {flow.code !== 'DIRECTORY_PUBLICATION' && (
                  <button
                    onClick={() => {
                      if (confirm('Tem certeza?')) deleteFlowMutation.mutate(flow.publicId);
                    }}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingFlowId && <FlowEditor flowId={editingFlowId} onClose={() => setEditingFlowId(null)} />}
    </div>
  );
};

const FlowEditor = ({ flowId, onClose }: { flowId: string; onClose: () => void }) => {
  const { data: flow } = useQuery({
    queryKey: ['prospecting-flow', flowId],
    queryFn: async () => {
      const res = await httpClient.request('GET', `/platform/prospecting/flows/${flowId}`);
      return res;
    },
  });

  if (!flow) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">← Voltar</button>
          <h2 className="text-2xl font-bold">{flow.name}</h2>
          <div />
        </div>

        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Descrição</label>
            <textarea className="w-full border rounded p-2" defaultValue={flow.description} placeholder="Descrição do fluxo" />
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Etapas do Fluxo</h3>
            <div className="space-y-4">
              {flow.steps && flow.steps.map((step: any, idx: number) => (
                <StepCard key={step.publicId} step={step} index={idx} flowId={flowId} />
              ))}
            </div>
            <button className="mt-4 px-4 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded hover:bg-blue-50 w-full">
              + Adicionar etapa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StepCard = ({ step, index, flowId }: { step: any; index: number; flowId: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <div className="font-semibold">
            ETAPA {index + 1} {step.isStart && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded ml-2">INÍCIO</span>}
          </div>
          <div className="text-sm text-gray-600">{step.name}</div>
          <div className="text-xs text-gray-500 mt-1">{stepTypeNames[step.stepType] || step.stepType}</div>
        </div>
        <button className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">Editar etapa</button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{step.message}</p>
          {step.options && step.options.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2">Respostas possíveis:</div>
              <div className="space-y-2">
                {step.options.map((opt: any) => (
                  <div key={opt.publicId} className="bg-white border rounded p-2 text-sm">
                    <div className="font-medium">{opt.label}</div>
                    {opt.patterns && opt.patterns.length > 0 && <div className="text-xs text-gray-500 mt-1">{opt.patterns.length} padrão(ões)</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
