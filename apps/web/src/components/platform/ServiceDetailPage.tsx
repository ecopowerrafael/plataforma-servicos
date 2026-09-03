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
  if (error instanceof Error)
    return (
      <section className="platform-detail-page">
        <ErrorState error={error.message} />
      </section>
    );
  if (!service) return <p>Serviço não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'info' as const, label: 'Informações' },
    { key: 'image' as const, label: 'Imagem' },
    { key: 'pricing' as const, label: 'Preço e duração' },
  ];

  return (
    <section className="platform-detail-page">
      <nav aria-label="Trilha" className="platform-breadcrumb">
        <button className="breadcrumb-link" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </nav>

      <article className="platform-panel">
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '2rem', alignItems: 'start' }}>
          <div>
            {service.imageUrl ? (
              <PlatformServiceImage
                alt={service.name}
                servicePublicId={service.publicId}
                tenantPublicId={tenantPublicId}
                variant="original"
                size={{ width: 120, height: 120 }}
              />
            ) : (
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#999',
                  fontSize: '0.75rem',
                }}
              >
                Sem imagem
              </div>
            )}
          </div>

          <div>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem' }}>{service.name}</h1>
            <p style={{ margin: '0 0 1rem 0', color: '#666' }}>
              {service.durationMinutes} min · R$ {(service.priceCents / 100).toFixed(2)}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor: service.active ? '#d1fae5' : '#fee2e2',
                  color: service.active ? '#065f46' : '#991b1b',
                }}
              >
                {service.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => toggleActive.mutate(!service.active)}
              disabled={toggleActive.isPending}
              className={service.active ? 'danger-button' : 'primary-button'}
            >
              {service.active ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      </article>

      <nav aria-label="Abas do serviço" className="prospecting-tabs">
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

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
          <article className="platform-panel">
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999', margin: '0 0 1rem 0', textTransform: 'uppercase' }}>
              Serviço
            </h3>
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
                <dd>{service.pricingMode}</dd>
              </div>
            </dl>
          </article>

          <article className="platform-panel">
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999', margin: '0 0 1rem 0', textTransform: 'uppercase' }}>
              Configuração
            </h3>
            <dl className="platform-details">
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
        </div>
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
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}
          >
            <label>
              <span>Nome</span>
              <input
                type="text"
                defaultValue={service.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Descrição</span>
              <textarea
                defaultValue={service.description || ''}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value || undefined }))}
                style={{ minHeight: '100px' }}
              />
            </label>

            <label>
              <span>Alt de imagem</span>
              <input
                type="text"
                defaultValue={service.imageAlt || ''}
                onChange={(e) => setFormData((f) => ({ ...f, imageAlt: e.target.value || undefined }))}
              />
            </label>

            <label>
              <span>Cor</span>
              <input
                type="color"
                defaultValue={service.color}
                onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
              />
            </label>

            {update.error instanceof Error && (
              <p className="form-error" style={{ gridColumn: '1 / -1' }}>
                {update.error.message}
              </p>
            )}

            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="secondary-button" onClick={() => setFormData(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={update.isPending}>
                {update.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </article>
      )}

      {tab === 'image' && (
        <article className="platform-panel">
          <div style={{ textAlign: 'center' }}>
            {service.imageUrl ? (
              <PlatformServiceImage
                alt={service.name}
                servicePublicId={service.publicId}
                tenantPublicId={tenantPublicId}
                variant="original"
                size={{ width: 200, height: 200 }}
              />
            ) : (
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  margin: '0 auto',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#999',
                }}
              >
                Sem imagem
              </div>
            )}
          </div>
          <div className="form-actions">
            <button className="primary-button" onClick={() => setImageModalOpen(true)}>
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
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}
          >
            <label>
              <span>Duração (minutos)</span>
              <input
                type="number"
                defaultValue={service.durationMinutes}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, durationMinutes: parseInt(e.target.value) || 0 }))
                }
              />
            </label>

            <label>
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

            <label>
              <span>Modo de preço</span>
              <input
                type="text"
                defaultValue={service.pricingMode || ''}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, pricingMode: e.target.value || undefined }))
                }
              />
            </label>

            <label>
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

            <label>
              <span>Aviso de orçamento</span>
              <input
                type="text"
                defaultValue={service.quoteNotice || ''}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, quoteNotice: e.target.value || undefined }))
                }
              />
            </label>

            {update.error instanceof Error && (
              <p className="form-error" style={{ gridColumn: '1 / -1' }}>
                {update.error.message}
              </p>
            )}

            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="secondary-button" onClick={() => setFormData(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={update.isPending}>
                {update.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </article>
      )}

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
    </section>
  );
}
