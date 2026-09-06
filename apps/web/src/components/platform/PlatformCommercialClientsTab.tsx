import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { z } from 'zod';

export function PlatformCommercialClientsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    managerPublicId: '',
    representativePublicId: '',
    sellerPublicId: '',
    subscriptionStatus: '',
  });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const clients = useQuery({
    queryKey: ['platform', 'commercial', 'clients', page, filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(filters.managerPublicId && { managerPublicId: filters.managerPublicId }),
        ...(filters.representativePublicId && { representativePublicId: filters.representativePublicId }),
        ...(filters.sellerPublicId && { sellerPublicId: filters.sellerPublicId }),
        ...(filters.subscriptionStatus && { subscriptionStatus: filters.subscriptionStatus }),
      });
      return httpClient.request(`/platform/commercial/clients?${params}`, {
        schema: z.object({
          clients: z.array(z.object({
            tenantPublicId: z.string(),
            tenantName: z.string(),
            subscription: z.any(),
            manager: z.object({ publicId: z.string(), displayName: z.string().nullable(), email: z.string() }).nullable(),
            representative: z.object({ publicId: z.string(), displayName: z.string().nullable(), email: z.string() }).nullable(),
            seller: z.object({ publicId: z.string(), displayName: z.string().nullable(), email: z.string() }).nullable(),
            assignedAt: z.string(),
          })),
          pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), pages: z.number() }),
        }),
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (data: any) =>
      httpClient.request('/platform/commercial/assign-tenant', {
        method: 'POST',
        body: data,
        schema: z.object({ success: z.boolean() }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'commercial', 'clients'] });
      setShowAssignModal(false);
      setSelectedClient(null);
    },
  });

  if (clients.isPending) {
    return <div className="tab-content"><p>Carregando clientes...</p></div>;
  }

  if (clients.error instanceof Error) {
    return <ErrorState message="Erro ao carregar clientes" />;
  }

  const data = clients.data;

  return (
    <div className="tab-content">
      <div className="section-header">
        <h3>Clientes Comerciais</h3>
        <button className="action-button" onClick={() => { setSelectedClient(null); setShowAssignModal(true); }}>
          + Atribuir Cliente
        </button>
      </div>

      <div className="filters-section">
        <input
          type="text"
          placeholder="Filtrar por gerente..."
          value={filters.managerPublicId}
          onChange={(e) => { setFilters({ ...filters, managerPublicId: e.target.value }); setPage(1); }}
          style={{ flex: 1, marginRight: '8px' }}
        />
        <select
          value={filters.subscriptionStatus}
          onChange={(e) => { setFilters({ ...filters, subscriptionStatus: e.target.value }); setPage(1); }}
          style={{ marginRight: '8px' }}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
      </div>

      {data.clients.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum cliente comercial atribuído</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Gerente</th>
                <th>Representante</th>
                <th>Vendedor</th>
                <th>Data do Vínculo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client: any) => (
                <tr key={client.tenantPublicId}>
                  <td><strong>{client.tenantName}</strong></td>
                  <td>{client.subscription?.plan?.code || '-'}</td>
                  <td>{client.subscription?.status || 'INACTIVE'}</td>
                  <td>{client.manager?.displayName || client.manager?.email || '-'}</td>
                  <td>{client.representative?.displayName || client.representative?.email || '-'}</td>
                  <td>{client.seller?.displayName || client.seller?.email || '-'}</td>
                  <td>{new Date(client.assignedAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                      onClick={() => { setSelectedClient(client); setShowAssignModal(true); }}
                    >
                      Reatribuir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pagination.pages > 1 && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </button>
          <span>{page} de {data.pagination.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))} disabled={page === data.pagination.pages}>
            Próxima
          </button>
        </div>
      )}

      {showAssignModal && (
        <AssignModal
          client={selectedClient}
          onClose={() => setShowAssignModal(false)}
          onAssign={(payload) => assignMutation.mutate(payload)}
          isLoading={assignMutation.isPending}
          error={assignMutation.error}
        />
      )}

      <style>{`
        .filters-section {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }
        .filters-section input,
        .filters-section select {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

function AssignModal({ client, onClose, onAssign, isLoading, error }: any) {
  const [tenantPublicId, setTenantPublicId] = useState(client?.tenantPublicId || '');
  const [managerPublicId, setManagerPublicId] = useState(client?.manager?.publicId || '');
  const [representativePublicId, setRepresentativePublicId] = useState(client?.representative?.publicId || '');
  const [sellerPublicId, setSellerPublicId] = useState(client?.seller?.publicId || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAssign({
      tenantPublicId,
      managerPublicId,
      representativePublicId: representativePublicId || undefined,
      sellerPublicId: sellerPublicId || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{client ? 'Reatribuir Cliente' : 'Atribuir Cliente'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!client && (
            <div>
              <label>Cliente*</label>
              <input type="text" placeholder="Selecione ou digite o cliente" required value={tenantPublicId} onChange={(e) => setTenantPublicId(e.target.value)} />
            </div>
          )}
          <div>
            <label>Gerente*</label>
            <input type="text" placeholder="UUID do gerente" required value={managerPublicId} onChange={(e) => { setManagerPublicId(e.target.value); setRepresentativePublicId(''); setSellerPublicId(''); }} />
          </div>
          <div>
            <label>Representante (opcional)</label>
            <input type="text" placeholder="UUID do representante" value={representativePublicId} onChange={(e) => setRepresentativePublicId(e.target.value)} />
          </div>
          <div>
            <label>Vendedor (opcional)</label>
            <input type="text" placeholder="UUID do vendedor" value={sellerPublicId} onChange={(e) => setSellerPublicId(e.target.value)} />
          </div>
          {error && <div style={{ color: 'red', fontSize: '14px' }}>{String(error)}</div>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="action-button" disabled={isLoading}>{isLoading ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
