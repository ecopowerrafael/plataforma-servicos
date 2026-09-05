import { ServiceListResponseSchema, ServicePublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { PlatformServiceImage } from './PlatformServiceImage.js';

interface ServicesManagerProps {
  tenantPublicId: string;
}

type Service = z.infer<typeof ServicePublicSchema>;

export function ServicesManager({ tenantPublicId }: ServicesManagerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-services', tenantPublicId, page, search, statusFilter],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services?page=${page}&limit=10${
          search ? `&search=${encodeURIComponent(search)}` : ''
        }${statusFilter !== undefined ? `&active=${statusFilter}` : ''}`,
        { schema: ServiceListResponseSchema },
      ),
  });

  const toggleActive = useMutation({
    mutationFn: ({ service, active }: { service: Service; active: boolean }) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${service.publicId}/${
          active ? 'activate' : 'deactivate'
        }`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-services', tenantPublicId],
      });
    },
  });

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Serviços</h2>
      </div>

      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar serviço…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select
          value={statusFilter === undefined ? '' : String(statusFilter)}
          onChange={(e) => {
            setStatusFilter(e.target.value === '' ? undefined : e.target.value === 'true');
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>

      {isLoading ? (
        <p>Carregando…</p>
      ) : data?.items.length === 0 ? (
        <p>Nenhum serviço encontrado.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Imagem
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Nome
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Duração
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Preço
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((svc) => (
                  <tr key={svc.publicId} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '0.75rem' }}>
                      {svc.imageUrl ? (
                        <PlatformServiceImage
                          alt={svc.name}
                          servicePublicId={svc.publicId}
                          tenantPublicId={tenantPublicId}
                        />
                      ) : (
                        <div
                          style={{
                            width: '56px',
                            height: '56px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            color: '#999',
                          }}
                        >
                          sem img
                        </div>
                      )}
                    </td>
                    <td
                      style={{ padding: '0.75rem', cursor: 'pointer' }}
                      onClick={() => navigate(`/platform/tenants/${tenantPublicId}/services/${svc.publicId}`)}
                    >
                      <div style={{ fontWeight: 500, color: '#0ea5e9' }}>{svc.name}</div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {svc.durationMinutes} min
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      R$ {(svc.priceCents / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          backgroundColor: svc.active ? '#d1fae5' : '#fee2e2',
                          color: svc.active ? '#065f46' : '#991b1b',
                        }}
                      >
                        {svc.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate(`/platform/tenants/${tenantPublicId}/services/${svc.publicId}`)}
                        className="secondary-button"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ service: svc, active: !svc.active })}
                        disabled={toggleActive.isPending}
                        className={svc.active ? 'danger-button' : 'primary-button'}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        {svc.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="secondary-button"
            >
              ← Anterior
            </button>
            <span style={{ padding: '0.5rem 1rem' }}>
              Página {data?.page.page} de {data?.page.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === data?.page.totalPages}
              className="secondary-button"
            >
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
