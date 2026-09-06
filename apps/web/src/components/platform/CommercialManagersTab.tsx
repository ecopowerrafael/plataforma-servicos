import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';
import { ErrorState, MetricCard } from './PlatformUi.js';
import { z } from 'zod';

const ManagerSchema = z.object({
  publicId: z.string(),
  email: z.string(),
  userId: z.bigint(),
  role: z.string(),
  active: z.boolean(),
  defaultCommissionBps: z.number(),
  regions: z.number(),
  cities: z.number(),
  clients: z.number(),
  team: z.number(),
  createdAt: z.date(),
});

type Manager = z.infer<typeof ManagerSchema>;

export function CommercialManagersTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    defaultCommissionBps: 5000,
  });

  const managers = useQuery({
    queryKey: ['platform', 'commercial', 'accounts'],
    queryFn: () =>
      httpClient
        .request('/platform/commercial/accounts', {
          schema: z.object({
            data: z.array(
              z.object({
                publicId: z.string(),
                email: z.string(),
                role: z.string(),
                active: z.boolean(),
                defaultCommissionBps: z.number(),
              }),
            ),
          }),
        })
        .then((r) => r.data.filter((m) => m.role === 'MANAGER')),
  });

  const createManager = useMutation({
    mutationFn: (data: typeof formData) =>
      httpClient.request('/platform/commercial/managers', {
        method: 'POST',
        body: data,
        schema: z.object({
          publicId: z.string(),
          email: z.string(),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'commercial', 'accounts'] });
      setShowForm(false);
      setFormData({ email: '', defaultCommissionBps: 5000 });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createManager.mutate(formData);
  };

  if (managers.isLoading)
    return (
      <div className="loading">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );

  if (managers.error instanceof Error)
    return <ErrorState message="Erro ao carregar gerentes" />;

  return (
    <div className="tab-content">
      <div className="section-header">
        <h3>Gerentes Comerciais</h3>
        <button className="action-button" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Novo Gerente'}
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email do Usuário</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              placeholder="gerente@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="commission">Comissão padrão (%)</label>
            <input
              id="commission"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.defaultCommissionBps / 100}
              onChange={(e) =>
                setFormData({ ...formData, defaultCommissionBps: Math.round(parseFloat(e.target.value) * 100) })
              }
            />
            <small>Percentual de comissão do gerente.</small>
          </div>

          <button type="submit" className="action-button" disabled={createManager.isPending}>
            {createManager.isPending ? 'Criando...' : 'Criar Gerente'}
          </button>
        </form>
      )}

      {!managers.data || managers.data.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum gerente cadastrado</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Comissão</th>
                <th>Regiões</th>
                <th>Clientes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {managers.data.map((manager) => (
                <tr key={manager.publicId}>
                  <td>{manager.email}</td>
                  <td>{(manager.defaultCommissionBps / 100).toFixed(2)}%</td>
                  <td>
                    <span className="badge">0</span>
                  </td>
                  <td>
                    <span className="badge">0</span>
                  </td>
                  <td>
                    <span className={`status-badge ${manager.active ? 'active' : 'inactive'}`}>
                      {manager.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tab-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .section-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .form-card {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          background: var(--bg-secondary);
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .data-table thead {
          background: var(--bg-secondary);
        }

        .data-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .data-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.active {
          background: rgba(34, 197, 94, 0.1);
          color: rgb(34, 197, 94);
        }

        .status-badge.inactive {
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
