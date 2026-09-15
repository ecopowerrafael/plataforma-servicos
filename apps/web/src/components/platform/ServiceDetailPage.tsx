import { ServicePublicSchema, UpdateServiceRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { PlatformServiceImage } from './PlatformServiceImage.js';
import { ServiceImageModal } from './ServiceImageModal.js';

type Service = z.infer<typeof ServicePublicSchema>;

export function ServiceDetailPage({ tenantPublicId }: { tenantPublicId: string }) {
  const { servicePublicId } = useParams<{ servicePublicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'overview' | 'info' | 'image' | 'pricing'>('overview');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Service> | null>(null);

  const { data: service, isLoading, error } = useQuery({
    queryKey: ['platform-service', tenantPublicId, servicePublicId],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${servicePublicId}`,
        { schema: ServicePublicSchema },
      ),
  });

  const update = useMutation({
    mutationFn: (body: z.infer<typeof UpdateServiceRequestSchema>) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${servicePublicId}`,
        {
          method: 'PATCH',
          body,
          schema: ServicePublicSchema,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-service', tenantPublicId],
      });
      setFormData(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${servicePublicId}/${
          active ? 'activate' : 'deactivate'
        }`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-service', tenantPublicId],
      });
    },
  });

  if (isLoading) return <i className="platform-skeleton" />;
  if (error instanceof Error) return <ErrorState error={error.message} />;
  if (!service) return <p>Serviço não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'info' as const, label: 'Informações' },
    { key: 'image' as const, label: 'Imagem' },
    { key: 'pricing' as const, label: 'Preço e duração' },
  ];

  return (
    <>
      <div className="platform-entity-header">
        <div className="platform-entity-avatar">
          {service.imageUrl ? (
            <PlatformServiceImage
              alt={service.name}
              servicePublicId={service.publicId}
              tenantPublicId={tenantPublicId}
              variant="original"
              size={{ width: 88, height: 88 }}
            />
          ) : (
            <div className="platform-entity-avatar-placeholder" />
          )}
        </div>

        <div className="platform-entity-info">
          <h1>{service.name}</h1>
          <p className="platform-entity-subtitle">
            {service.durationMinutes} min · R$ {(service.priceCents / 100).toFixed(2)}
          </p>
          <div className="platform-entity-status">
            <span className={service.active ? 'status-active' : 'status-inactive'}>
              {service.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>

        <div className="platform-entity-actions">
          <button
            onClick={() => toggleActive.mutate(!service.active)}
            disabled={toggleActive.isPending}
            className={service.active ? 'action-button danger' : 'action-button primary'}
          >
            {service.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      <div className="platform-entity-summary">
        <article className="platform-panel">
          <h3>Detalhes</h3>
          <dl className="platform-details">
            <div>
              <dt>Duração</dt>
              <dd>{service.durationMinutes} minutos</dd>
            </div>
            <div>
              <dt>Preço</dt>
              <dd>R$ {(service.priceCents / 100).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Modo de preço</dt>
              <dd>{service.pricingMode || '—'}</dd>
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
            <dl className="platform-details">
              <div>
                <dt>Duração</dt>
                <dd>{service.durationMinutes} minutos</dd>
              </div>
              <div>
                <dt>Preço</dt>
                <dd>R$ {(service.priceCents / 100).toFixed(2)}</dd>
              </div>
              <div>
                <dt>Pausa pós-serviço</dt>
                <dd>{service.hasPostServiceBreak ? `Sim (${service.postServiceBreakMinutes} min)` : 'Não'}</dd>
              </div>
              {service.quoteNotice && (
                <div>
                  <dt>Aviso de orçamento</dt>
                  <dd>{service.quoteNotice}</dd>
                </div>
              )}
            </dl>
          </article>
        )}

        {tab === 'info' && (
          <article className="platform-panel">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formData) return;
                update.mutate({
                  name: formData.name || service.name,
                  description: formData.description,
                  imageAlt: formData.imageAlt,
                  iconKey: formData.iconKey,
                  categoryPublicId: formData.categoryPublicId || service.categoryPublicId,
                  durationMinutes: formData.durationMinutes || service.durationMinutes,
                  hasPostServiceBreak: formData.hasPostServiceBreak ?? service.hasPostServiceBreak,
                  postServiceBreakMinutes: formData.postServiceBreakMinutes || service.postServiceBreakMinutes,
                  priceCents: formData.priceCents || service.priceCents,
                  pricingMode: formData.pricingMode || service.pricingMode,
                  quoteNotice: formData.quoteNotice,
                  color: formData.color || service.color,
                  sortOrder: formData.sortOrder || service.sortOrder,
                  active: formData.active !== undefined ? formData.active : service.active,
                } as any);
              }}
              className="platform-form"
            >
              <div className="platform-form-grid">
                <label className="platform-form-field">
                  <span>Nome</span>
                  <input
                    type="text"
                    defaultValue={service.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Cor</span>
                  <input
                    type="color"
                    defaultValue={service.color}
                    onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                  />
                </label>

                <label className="platform-form-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Descrição</span>
                  <textarea
                    defaultValue={service.description || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value || undefined }))}
                    rows={4}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Alt de imagem</span>
                  <input
                    type="text"
                    defaultValue={service.imageAlt || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, imageAlt: e.target.value || undefined }))}
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

        {tab === 'image' && (
          <article className="platform-panel">
            <div className="platform-image-preview">
              {service.imageUrl ? (
                <PlatformServiceImage
                  alt={service.name}
                  servicePublicId={service.publicId}
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

        {tab === 'pricing' && (
          <article className="platform-panel">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formData) return;
                update.mutate({
                  name: service.name,
                  description: service.description,
                  imageAlt: service.imageAlt,
                  iconKey: service.iconKey,
                  categoryPublicId: service.categoryPublicId,
                  durationMinutes: formData.durationMinutes || service.durationMinutes,
                  hasPostServiceBreak: formData.hasPostServiceBreak ?? service.hasPostServiceBreak,
                  postServiceBreakMinutes: formData.postServiceBreakMinutes || service.postServiceBreakMinutes,
                  priceCents: formData.priceCents || service.priceCents,
                  pricingMode: formData.pricingMode || service.pricingMode,
                  quoteNotice: formData.quoteNotice,
                  color: service.color,
                  sortOrder: service.sortOrder,
                } as any);
              }}
              className="platform-form"
            >
              <div className="platform-form-grid">
                <label className="platform-form-field">
                  <span>Duração (minutos)</span>
                  <input
                    type="number"
                    defaultValue={service.durationMinutes}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, durationMinutes: parseInt(e.target.value) || 0 }))
                    }
                  />
                </label>

                <label className="platform-form-field">
                  <span>Preço (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={(service.priceCents / 100).toFixed(2)}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        priceCents: Math.round(parseFloat(e.target.value) * 100) || 0,
                      }))
                    }
                  />
                </label>

                <label className="platform-form-field">
                  <span>Modo de preço</span>
                  <input
                    type="text"
                    defaultValue={service.pricingMode || ''}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, pricingMode: e.target.value || undefined }))
                    }
                  />
                </label>

                <label className="platform-form-field">
                  <span>Pausa pós-serviço (minutos)</span>
                  <input
                    type="number"
                    defaultValue={service.postServiceBreakMinutes}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        postServiceBreakMinutes: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </label>

                <label className="platform-form-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Aviso de orçamento</span>
                  <input
                    type="text"
                    defaultValue={service.quoteNotice || ''}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, quoteNotice: e.target.value || undefined }))
                    }
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
      </div>

      {imageModalOpen && (
        <ServiceImageModal
          service={service}
          tenantPublicId={tenantPublicId}
          onClose={() => setImageModalOpen(false)}
          onImageUpdated={() => {
            queryClient.invalidateQueries({
              queryKey: ['platform-service', tenantPublicId],
            });
          }}
        />
      )}
    </>
  );
}
