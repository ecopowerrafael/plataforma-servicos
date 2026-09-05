import { ProfessionalListResponseSchema, ProfessionalPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { PlatformProfessionalPhoto } from './PlatformProfessionalPhoto.js';

interface ProfessionalsManagerProps {
  tenantPublicId: string;
}

type Professional = z.infer<typeof ProfessionalPublicSchema>;

export function ProfessionalsManager({ tenantPublicId }: ProfessionalsManagerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-professionals', tenantPublicId, page, search, statusFilter],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals?page=${page}&limit=10${
          search ? `&search=${encodeURIComponent(search)}` : ''
        }${statusFilter !== undefined ? `&active=${statusFilter}` : ''}`,
        { schema: ProfessionalListResponseSchema },
      ),
  });

  const toggleActive = useMutation({
    mutationFn: ({ professional, active }: { professional: Professional; active: boolean }) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${professional.publicId}/${
          active ? 'activate' : 'deactivate'
        }`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-professionals', tenantPublicId],
      });
    },
  });

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Profissionais</h2>
      </div>

      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar profissional…"
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
        <p>Nenhum profissional encontrado.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Foto
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Nome
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Telefone
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem' }}>
                    Email
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
                {data?.items.map((prof) => (
                  <tr key={prof.publicId} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '0.75rem' }}>
                      {prof.photoUrl ? (
                        <PlatformProfessionalPhoto
                          alt={prof.name}
                          professionalPublicId={prof.publicId}
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
                          sem foto
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', cursor: 'pointer' }} onClick={() => navigate(`/platform/tenants/${tenantPublicId}/professionals/${prof.publicId}`)}>
                      <div style={{ fontWeight: 500, color: '#0ea5e9' }}>{prof.name}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>{prof.publicName}</div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {prof.phone || '—'}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {prof.email || '—'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          backgroundColor: prof.active ? '#d1fae5' : '#fee2e2',
                          color: prof.active ? '#065f46' : '#991b1b',
                        }}
                      >
                        {prof.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate(`/platform/tenants/${tenantPublicId}/professionals/${prof.publicId}`)}
                        className="secondary-button"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ professional: prof, active: !prof.active })}
                        disabled={toggleActive.isPending}
                        className={prof.active ? 'danger-button' : 'primary-button'}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        {prof.active ? 'Desativar' : 'Ativar'}
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
