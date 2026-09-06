import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';
import { PaymentModal } from './PaymentModal.js';

export function CommercialClientsTab() {
  const [selectedTenant, setSelectedTenant] = useState<{ publicId: string; name: string } | null>(null);

  const me = useQuery({
    queryKey: ['commercial', 'me'],
    queryFn: () =>
      httpClient.request('/commercial/me', {
        schema: z.object({ role: z.string() }),
      }),
    retry: false,
  });

  const clients = useQuery({
    queryKey: ['commercial', 'clients'],
    queryFn: () =>
      httpClient.request('/commercial/clients', {
        schema: z.array(
          z.object({
            tenantId: z.bigint(),
            tenantName: z.string(),
            tenantPublicId: z.string(),
            status: z.string(),
            managerId: z.string().nullable(),
            representativeId: z.string().nullable(),
            sellerId: z.string().nullable(),
          }),
        ),
      }),
    retry: false,
  });

  if (clients.isPending) {
    return (
      <div className="loading">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  }

  if (clients.error instanceof Error) {
    return <ErrorState message="Erro ao carregar clientes" />;
  }

  if (!clients.data || clients.data.length === 0) {
    return (
      <div className="empty-state">
        <p>Nenhum cliente atribuído</p>
      </div>
    );
  }

  const getStatusBadgeClass = (status: string) => {
    if (status === 'ACTIVE' || status === 'PAST_DUE') return 'active';
    if (status === 'TRIALING') return 'trial';
    return 'inactive';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'ACTIVE') return 'Ativo';
    if (status === 'PAST_DUE') return 'Vencimento';
    if (status === 'TRIALING') return 'Teste';
    return 'Inativo';
  };

  return (
    <div className="clients-content">
      <h3>Clientes Atribuídos</h3>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome do Cliente</th>
              <th>Status</th>
              <th>Representante</th>
              <th>Vendedor</th>
              {me.data?.role === 'MANAGER' && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {clients.data.map((client) => (
              <tr key={client.tenantPublicId}>
                <td>
                  <strong>{client.tenantName}</strong>
                  <br />
                  <small className="text-secondary">{client.tenantPublicId}</small>
                </td>
                <td>
                  <span className={`status-badge ${getStatusBadgeClass(client.status)}`}>
                    {getStatusLabel(client.status)}
                  </span>
                </td>
                <td>{client.representativeId ? '✓ Atribuído' : '—'}</td>
                <td>{client.sellerId ? '✓ Atribuído' : '—'}</td>
                {me.data?.role === 'MANAGER' && (
                  <td>
                    <button
                      className="btn-mark-paid"
                      onClick={() => setSelectedTenant({ publicId: client.tenantPublicId, name: client.tenantName })}
                    >
                      Marcar como pago
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTenant && (
        <PaymentModal
          tenantPublicId={selectedTenant.publicId}
          tenantName={selectedTenant.name}
          onClose={() => setSelectedTenant(null)}
          onSuccess={() => clients.refetch()}
        />
      )}

      <style>{`
        .clients-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .clients-content h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .table-container {
          overflow-x: auto;
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .data-table thead {
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .data-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .data-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .data-table tbody tr:hover {
          background: var(--bg-secondary);
        }

        .text-secondary {
          color: var(--text-secondary);
          font-size: 12px;
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

        .status-badge.trial {
          background: rgba(59, 130, 246, 0.1);
          color: rgb(59, 130, 246);
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

        .loading {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .skeleton-line {
          height: 20px;
          background: var(--bg-secondary);
          border-radius: 4px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .btn-mark-paid {
          padding: 6px 12px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-mark-paid:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
