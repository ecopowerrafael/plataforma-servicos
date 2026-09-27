import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';
import './prospecting-objections.css';

export const ProspectingObjectionCreatePage = ({
  onBack,
}: {
  onBack: () => void;
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    suggestedResponse: '',
    autoReplyAllowed: false,
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      httpClient.request('/platform/prospecting/objections', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting', 'objections'] });
      onBack();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao criar objeção';
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    setError(null);
    void createMutation.mutateAsync(formData);
  };

  return (
    <div className="objection-editor-page">
      <div className="objection-editor-header">
        <button
          onClick={onBack}
          className="back-button"
        >
          ← Objeções
        </button>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          backgroundColor: '#fee',
          color: '#c33',
          borderRadius: '6px',
          fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      <div className="objection-editor-container">
        <div className="objection-settings-card">
          <h2>Nova Objeção</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ex: Contato errado"
                required
              />
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                className="form-input"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="ex: Número ou pessoa errada"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Resposta Sugerida</label>
              <textarea
                className="form-input"
                value={formData.suggestedResponse}
                onChange={(e) => setFormData({ ...formData, suggestedResponse: e.target.value })}
                placeholder="Sugestão de resposta automática para o lead"
                rows={3}
              />
            </div>

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

            <div className="modal-actions">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="primary-button"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Objeção'}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="secondary-button"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>

        <div className="objection-patterns-card">
          <h3>Padrões de Reconhecimento</h3>
          <div className="empty-state">
            Adicione padrões após criar a objeção.
          </div>
        </div>
      </div>
    </div>
  );
};
