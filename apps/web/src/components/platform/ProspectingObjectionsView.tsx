import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { ProspectingObjectionEditPage } from './ProspectingObjectionEditPage.js';
import { ProspectingObjectionCreatePage } from './ProspectingObjectionCreatePage.js';

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
  const [showPreview, setShowPreview] = useState(false);
  const [previewInput, setPreviewInput] = useState('');
  const [submittedPreview, setSubmittedPreview] = useState('');

  const objections = useQuery({
    queryKey: ['prospecting', 'objections'],
    queryFn: () => httpClient.request('/platform/prospecting/objections', { schema: objectionsResponseSchema }),
  });

  const previewResult = useQuery({
    queryKey: ['prospecting', 'classify-preview', submittedPreview],
    queryFn: () =>
      httpClient.request('/platform/prospecting/objections/classify-preview', {
        method: 'POST',
        body: JSON.stringify({ text: submittedPreview }),
        schema: classifyPreviewSchema,
      }),
    enabled: submittedPreview.length > 0,
  });

  const deleteObjectionMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/objections/${publicId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
    },
  });

  if (view.type === 'create') {
    return (
      <ProspectingObjectionCreatePage
        onBack={() => {
          setView({ type: 'list' });
          queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
        }}
      />
    );
  }

  if (view.type === 'edit') {
    return (
      <ProspectingObjectionEditPage
        objectionId={view.objectionId}
        onBack={() => {
          setView({ type: 'list' });
          queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
        }}
        onFeedback={() => {}}
      />
    );
  }

  const totalObjections = objections.data?.items?.length || 0;
  const activeObjections = objections.data?.items?.filter((item: Objection) => item.isActive).length || 0;
  const autoReplyObjections = objections.data?.items?.filter((item: Objection) => item.autoReplyAllowed).length || 0;
  const totalPatterns = objections.data?.items?.reduce((total: number, item: Objection) => total + item.patterns.length, 0) || 0;

  return (
    <section className="prospecting-objections-page">
      <div className="objections-page-header">
        <div className="objections-page-title">
          <h1>Objeções e Padrões</h1>
          <p>Configure como o sistema identifica respostas dos leads e define ações automáticas.</p>
        </div>
        <div className="objections-page-actions">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="secondary-button"
          >
            Testar classificação
          </button>
          <button
            onClick={() => setView({ type: 'create' })}
            className="primary-button"
          >
            + Nova Objeção
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="objections-preview-card">
          <h3>Testar classificação</h3>
          <p className="objections-preview-hint">Digite uma resposta real recebida de um lead.</p>
          <textarea
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
            placeholder="ex: Não entendi, pode repetir?"
            rows={3}
            className="form-input"
          />
          <button
            onClick={() => setSubmittedPreview(previewInput)}
            disabled={!previewInput.trim()}
            className="primary-button"
          >
            Analisar mensagem
          </button>

          {submittedPreview && (
            <div className="objections-preview-result">
              {previewResult.isPending ? (
                <p>Analisando...</p>
              ) : previewResult.error ? (
                <p>Erro na classificação</p>
              ) : previewResult.data ? (
                <div>
                  <p className="objections-preview-label">Resultado:</p>
                  <div className="objections-preview-result-box">
                    <strong>
                      {previewResult.data.objectionName || 'Nenhuma objeção identificada'}
                    </strong>
                  </div>
                </div>
              ) : null}
            </div>
          )}
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
          <button onClick={() => setView({ type: 'create' })} className="primary-button">
            Criar primeira objeção
          </button>
        </div>
      ) : (
        <>
          <div className="objections-summary">
            <div className="objections-summary-card">
              <div className="summary-number">{totalObjections}</div>
              <div className="summary-label">Objeções</div>
            </div>
            <div className="objections-summary-card">
              <div className="summary-number">{activeObjections}</div>
              <div className="summary-label">Ativas</div>
            </div>
            <div className="objections-summary-card">
              <div className="summary-number">{autoReplyObjections}</div>
              <div className="summary-label">Resposta automática</div>
            </div>
            <div className="objections-summary-card">
              <div className="summary-number">{totalPatterns}</div>
              <div className="summary-label">Padrões cadastrados</div>
            </div>
          </div>

          <div className="objections-table-container">
            <table className="objections-table">
              <thead>
                <tr>
                  <th>Objeção</th>
                  <th>Status</th>
                  <th>Resposta Automática</th>
                  <th>Padrões</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {objections.data.items.map((objection: Objection) => (
                  <tr key={objection.publicId}>
                    <td className="objection-name-cell">
                      <div className="objection-name">{objection.name}</div>
                      {objection.description && (
                        <div className="objection-description-cell">{objection.description}</div>
                      )}
                    </td>
                    <td>
                      <span className={`objection-status-badge ${objection.isActive ? 'active' : 'inactive'}`}>
                        {objection.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <span className={`objection-auto-badge ${objection.autoReplyAllowed ? 'enabled' : 'disabled'}`}>
                        {objection.autoReplyAllowed ? 'Ativada' : 'Desativada'}
                      </span>
                    </td>
                    <td>{objection.patterns.length}</td>
                    <td>
                      <div className="objections-table-actions">
                        <button
                          onClick={() => setView({ type: 'edit', objectionId: objection.publicId })}
                          className="secondary-button"
                        >
                          Editar
                        </button>
                        {!objection.code && (
                          <button
                            onClick={() => void deleteObjectionMutation.mutateAsync(objection.publicId)}
                            disabled={deleteObjectionMutation.isPending}
                            className="objection-delete-action"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="objections-mobile-list">
            {objections.data.items.map((objection: Objection) => (
              <div key={objection.publicId} className="objection-mobile-card">
                <div className="objection-mobile-header">
                  <h3>{objection.name}</h3>
                  {objection.description && (
                    <p>{objection.description}</p>
                  )}
                </div>

                <div>
                  <span className={`objection-status-badge ${objection.isActive ? 'active' : 'inactive'}`}>
                    {objection.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <div className="objection-mobile-meta">
                  <div>{objection.patterns.length} padrões</div>
                  <div>Resposta automática: {objection.autoReplyAllowed ? 'Ativada' : 'Desativada'}</div>
                </div>

                <button
                  onClick={() => setView({ type: 'edit', objectionId: objection.publicId })}
                  className="primary-button"
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
