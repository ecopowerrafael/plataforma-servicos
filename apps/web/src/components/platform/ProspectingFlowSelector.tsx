import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';

interface ProspectingFlow {
  publicId: string;
  name: string;
  description?: string;
  stepCount?: number;
}

interface ProspectingFlowSelectorProps {
  selectedFlowId: string | null | undefined;
  onBack: () => void;
  onSelect: (flowPublicId: string | null) => void;
}

export function ProspectingFlowSelector({ selectedFlowId, onBack, onSelect }: ProspectingFlowSelectorProps) {
  const [selected, setSelected] = useState<string | null>(selectedFlowId || null);

  const { data: flowsData, isLoading, isError } = useQuery({
    queryKey: ['prospecting-flows'],
    queryFn: async () => {
      const response = await httpClient.request('/platform/prospecting/flows');
      return (response as any).items || [];
    },
  });

  const flows = flowsData as ProspectingFlow[] | undefined;

  const handleContinue = () => {
    onSelect(selected);
  };

  return (
    <div className="prospecting-create-step">
      <div className="step-section">
        <h2>Escolha o Fluxo</h2>
        <p className="step-description">Selecione o fluxo de mensagens que será executado para cada contato.</p>

        {isLoading && <p className="loading-message">Carregando fluxos...</p>}

        {isError && (
          <div className="form-error-box">
            ✗ Erro ao carregar fluxos
            <button onClick={() => window.location.reload()} type="button" style={{ marginLeft: '1rem' }}>
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !isError && flows && flows.length > 0 && (
          <div className="prospecting-flow-grid">
            {flows.map((flow) => (
              <label key={flow.publicId} className="flow-card">
                <input
                  type="radio"
                  name="flow"
                  value={flow.publicId}
                  checked={selected === flow.publicId}
                  onChange={(e) => setSelected(e.target.value)}
                  style={{ display: 'none' }}
                />
                <div className={`flow-card-content ${selected === flow.publicId ? 'selected' : ''}`}>
                  <div className="flow-card-header">
                    <h3>{flow.name}</h3>
                    <span className="flow-step-count">{flow.stepCount || 1} etapa(s)</span>
                  </div>
                  {flow.description && <p className="flow-description">{flow.description}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        {!isLoading && !isError && flows && flows.length === 0 && (
          <div className="empty-state">
            <p>Nenhum fluxo disponível. Crie um fluxo antes de criar uma campanha.</p>
          </div>
        )}

        <div className="prospecting-create-footer">
          <button type="button" onClick={onBack} className="secondary-button">
            Voltar
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="primary-button"
            disabled={!selected}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
