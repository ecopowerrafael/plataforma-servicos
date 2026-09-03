import { ComboPublicSchema, ServiceListResponseSchema, UpdateComboRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { PlatformComboImage } from './PlatformComboImage.js';
import { ComboImageModal } from './ComboImageModal.js';

type Combo = z.infer<typeof ComboPublicSchema>;

export function ComboDetailPage({ tenantPublicId }: { tenantPublicId: string }) {
  const { comboPublicId } = useParams<{ comboPublicId: string }>();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'overview' | 'info' | 'services' | 'image'>('overview');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Combo> | null>(null);

  const { data: combo, isLoading, error } = useQuery({
    queryKey: ['platform-combo', tenantPublicId, comboPublicId],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos/${comboPublicId}`,
        { schema: ComboPublicSchema },
      ),
  });

  const { data: servicesData } = useQuery({
    queryKey: ['platform-services', tenantPublicId],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/services?page=1&limit=100`, {
        schema: ServiceListResponseSchema,
      }),
  });

  const update = useMutation({
    mutationFn: (body: z.infer<typeof UpdateComboRequestSchema>) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos/${comboPublicId}`,
        {
          method: 'PATCH',
          body,
          schema: ComboPublicSchema,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-combo', tenantPublicId],
      });
      setFormData(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos/${comboPublicId}/${active ? 'activate' : 'deactivate'}`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-combo', tenantPublicId],
      });
    },
  });

  if (isLoading) return <i className="platform-skeleton" />;
  if (error instanceof Error) return <ErrorState error={error.message} />;
  if (!combo) return <p>Combo não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'info' as const, label: 'Informações' },
    { key: 'services' as const, label: 'Serviços' },
    { key: 'image' as const, label: 'Imagem' },
  ];

  const allServices = servicesData?.items || [];
  const servicesInCombo = combo.items.map((item) => allServices.find((s) => s.publicId === item.servicePublicId)).filter(Boolean);

  return (
    <>
      <div className="platform-entity-header">
        <div className="platform-entity-avatar">
          {combo.imageUrl ? (
            <PlatformComboImage
              alt={combo.name}
              comboPublicId={combo.publicId}
              tenantPublicId={tenantPublicId}
              variant="original"
              size={{ width: 88, height: 88 }}
            />
          ) : (
            <div className="platform-entity-avatar-placeholder" />
          )}
        </div>

        <div className="platform-entity-info">
          <h1>{combo.name}</h1>
          <p className="platform-entity-subtitle">
            {combo.items.length} serviço{combo.items.length !== 1 ? 's' : ''} · {combo.durationMinutes} min
          </p>
          <div className="platform-entity-status">
            <span className={combo.active ? 'status-active' : 'status-inactive'}>
              {combo.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>

        <div className="platform-entity-actions">
          <button
            onClick={() => toggleActive.mutate(!combo.active)}
            disabled={toggleActive.isPending}
            className={combo.active ? 'action-button danger' : 'action-button primary'}
          >
            {combo.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      <div className="platform-entity-summary">
        <article className="platform-panel">
          <h3>Preço</h3>
          <dl className="platform-details">
            <div>
              <dt>Valor</dt>
              <dd>R$ {(Number(combo.priceCents) / 100).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Duração total</dt>
              <dd>{combo.durationMinutes} minutos</dd>
            </div>
          </dl>
        </article>

        <article className="platform-panel">
          <h3>Composição</h3>
          <dl className="platform-details">
            <div>
              <dt>Serviços</dt>
              <dd>{combo.items.length}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{combo.active ? 'Ativo' : 'Inativo'}</dd>
            </div>
          </dl>
        </article>
      </div>

      <nav className="platform-entity-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="platform-entity-content">
        {tab === 'overview' && (
          <article className="platform-panel">
            <h3>Serviços incluídos</h3>
            {combo.items.length === 0 ? (
              <p style={{ color: '#57534e' }}>Nenhum serviço incluído.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {combo.items.map((item, idx) => (
                  <li
                    key={idx}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#faf8f5',
                      borderRadius: '8px',
                      borderLeft: '3px solid #c5a059',
                    }}
                  >
                    <strong>{item.name}</strong> · {item.durationMinutes} min
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {tab === 'info' && (
          <article className="platform-panel">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formData || !combo) return;
                update.mutate({
                  name: formData.name || combo.name,
                  description: formData.description || combo.description || null,
                  imageAlt: formData.imageAlt || combo.imageAlt || null,
                  priceCents: formData.priceCents ? Number(formData.priceCents) : Number(combo.priceCents),
                  sortOrder: formData.sortOrder || combo.sortOrder,
                  active: formData.active !== undefined ? formData.active : combo.active,
                  items: combo.items.map((item) => ({
                    servicePublicId: item.servicePublicId,
                    sortOrder: item.sortOrder,
                  })),
                });
              }}
              className="platform-form"
            >
              <div className="platform-form-grid">
                <label className="platform-form-field">
                  <span>Nome</span>
                  <input
                    type="text"
                    defaultValue={combo.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Preço (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={(Number(combo.priceCents) / 100).toFixed(2)}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        priceCents: Math.round(parseFloat(e.target.value) * 100),
                      }))
                    }
                  />
                </label>

                <label className="platform-form-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Descrição</span>
                  <textarea
                    defaultValue={combo.description || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value || undefined }))}
                    rows={4}
                  />
                </label>
              </div>

              {update.error instanceof Error && (
                <p className="form-error">{update.error.message}</p>
              )}

              <div className="platform-form-actions">
                <button type="button" className="action-button secondary" onClick={() => setFormData(null)}>
                  Cancelar
                </button>
                <button type="submit" className="action-button primary" disabled={update.isPending}>
                  {update.isPending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </article>
        )}

        {tab === 'services' && (
          <article className="platform-panel">
            <h3>Serviços do combo</h3>
            {combo.items.length === 0 ? (
              <p style={{ color: '#57534e' }}>Nenhum serviço neste combo.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                {combo.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#faf8f5',
                      borderRadius: '8px',
                      border: '1px solid #ede8e1',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>{item.name}</h4>
                    <dl style={{ margin: 0, fontSize: '0.85rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.5rem' }}>
                        <dt style={{ fontWeight: 600, color: '#57534e' }}>Duração:</dt>
                        <dd style={{ margin: 0 }}>{item.durationMinutes} min</dd>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.5rem' }}>
                        <dt style={{ fontWeight: 600, color: '#57534e' }}>Pausa:</dt>
                        <dd style={{ margin: 0 }}>
                          {item.hasPostServiceBreak ? `${item.postServiceBreakMinutes} min` : 'Não'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </article>
        )}

        {tab === 'image' && (
          <article className="platform-panel">
            <div className="platform-image-preview">
              {combo.imageUrl ? (
                <PlatformComboImage
                  alt={combo.name}
                  comboPublicId={combo.publicId}
                  tenantPublicId={tenantPublicId}
                  variant="original"
                  size={{ width: 240, height: 240 }}
                />
              ) : (
                <div className="platform-image-placeholder">Sem imagem</div>
              )}
            </div>
            <div className="platform-form-actions">
              <button className="action-button primary" onClick={() => setImageModalOpen(true)}>
                Gerenciar imagem
              </button>
            </div>
          </article>
        )}
      </div>

      {imageModalOpen && (
        <ComboImageModal
          combo={combo}
          tenantPublicId={tenantPublicId}
          onClose={() => setImageModalOpen(false)}
          onImageUpdated={() => {
            queryClient.invalidateQueries({
              queryKey: ['platform-combo', tenantPublicId],
            });
          }}
        />
      )}
    </>
  );
}
