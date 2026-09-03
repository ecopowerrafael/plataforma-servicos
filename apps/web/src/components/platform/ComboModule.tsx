import { ComboListResponseSchema, ComboPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState, PageHeader } from './PlatformUi.js';
import { PlatformComboImage } from './PlatformComboImage.js';
import { ComboCreateModal } from './ComboCreateModal.js';

type Combo = z.infer<typeof ComboPublicSchema>;

export function ComboModule({ tenantPublicId }: { tenantPublicId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-combos', tenantPublicId, page, search, status],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos?page=${page}&limit=10&search=${search || ''}&active=${
          status === 'all' ? '' : status === 'active' ? 'true' : 'false'
        }`,
        { schema: ComboListResponseSchema },
      ),
  });

  const toggleActive = useMutation({
    mutationFn: (combo: Combo) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos/${combo.publicId}/${
          combo.active ? 'deactivate' : 'activate'
        }`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-combos', tenantPublicId],
      });
    },
  });

  if (isLoading) return <i className="platform-skeleton" />;
  if (error instanceof Error) return <ErrorState error={error.message} />;
  if (!data) return <p>Nenhum dado disponível.</p>;

  return (
    <section>
      <PageHeader
        title="Combos"
        description="Gerencie os pacotes de serviços oferecidos"
        action={
          <button className="action-button primary" onClick={() => setCreateModalOpen(true)}>
            + Novo combo
          </button>
        }
      />

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Buscar combos..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            flex: '1 1 200px',
            padding: '0.65rem 0.85rem',
            border: '1px solid #ede8e1',
            borderRadius: '10px',
            fontSize: '0.88rem',
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as any);
            setPage(1);
          }}
          style={{
            padding: '0.65rem 0.85rem',
            border: '1px solid #ede8e1',
            borderRadius: '10px',
            fontSize: '0.88rem',
            backgroundColor: '#ffffff',
          }}
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {data.items.length === 0 ? (
        <article className="platform-panel">
          <p style={{ textAlign: 'center', color: '#57534e' }}>Nenhum combo encontrado.</p>
        </article>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {data.items.map((combo) => (
            <article
              key={combo.publicId}
              className="platform-panel"
              style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto', gap: '1rem', alignItems: 'center' }}
            >
              <div>
                {combo.imageUrl ? (
                  <PlatformComboImage
                    alt={combo.name}
                    comboPublicId={combo.publicId}
                    tenantPublicId={tenantPublicId}
                    variant="thumbnail"
                    size={{ width: 80, height: 80 }}
                  />
                ) : (
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      color: '#999',
                    }}
                  >
                    Sem imagem
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{combo.name}</h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e' }}>
                  {combo.items.length} serviço{combo.items.length !== 1 ? 's' : ''} · {combo.durationMinutes} min
                </p>
                <p style={{ margin: '0', fontSize: '0.88rem', fontWeight: 600, color: '#1c1917' }}>
                  R$ {(Number(combo.priceCents) / 100).toFixed(2)}
                </p>
              </div>

              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: combo.active ? '#f0fdf4' : '#fff1f2',
                    color: combo.active ? '#047857' : '#b91c1c',
                    border: `1px solid ${combo.active ? '#bbf7d0' : '#fecdd3'}`,
                  }}
                >
                  {combo.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                <button
                  onClick={() => navigate(`/platform/tenants/${tenantPublicId}/combos/${combo.publicId}`)}
                  className="action-button primary"
                  style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                >
                  Abrir
                </button>
                <button
                  onClick={() => toggleActive.mutate(combo)}
                  disabled={toggleActive.isPending}
                  className={combo.active ? 'action-button danger' : 'action-button primary'}
                  style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                >
                  {combo.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {data.page.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          {Array.from({ length: data.page.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: p === page ? '2px solid #c5a059' : '1px solid #ede8e1',
                backgroundColor: p === page ? '#faf5eb' : '#ffffff',
                color: p === page ? '#996515' : '#57534e',
                fontWeight: p === page ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {createModalOpen && (
        <ComboCreateModal
          tenantPublicId={tenantPublicId}
          onClose={() => setCreateModalOpen(false)}
          onComboCreated={(combo) => {
            setCreateModalOpen(false);
            queryClient.invalidateQueries({
              queryKey: ['platform-combos', tenantPublicId],
            });
            navigate(`/platform/tenants/${tenantPublicId}/combos/${combo.publicId}`);
          }}
        />
      )}
    </section>
  );
}
