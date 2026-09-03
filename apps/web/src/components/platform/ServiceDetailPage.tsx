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

  const [tab, setTab] = useState<'overview' | 'info' | 'image' | 'category' | 'pricing'>('overview');
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

  if (isLoading) return <p style={{ padding: '2rem' }}>Carregando…</p>;
  if (error instanceof Error)
    return (
      <div style={{ padding: '2rem' }}>
        <ErrorState error={error.message} />
      </div>
    );
  if (!service) return <p style={{ padding: '2rem' }}>Serviço não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'info' as const, label: 'Informações' },
    { key: 'image' as const, label: 'Imagem' },
    { key: 'category' as const, label: 'Categoria' },
    { key: 'pricing' as const, label: 'Preço e duração' },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0ea5e9',
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
            }}
          >
            ← Voltar
          </button>
          <h1>{service.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => toggleActive.mutate(!service.active)}
            disabled={toggleActive.isPending}
            className={service.active ? 'danger-button' : 'primary-button'}
          >
            {service.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #e5e5e5', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '1rem 0',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid #0ea5e9' : 'none',
                color: tab === t.key ? '#0ea5e9' : '#666',
                cursor: 'pointer',
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#999', marginBottom: '0.5rem' }}>
              Imagem
            </h3>
            {service.imageUrl ? (
              <PlatformServiceImage
                alt={service.name}
                servicePublicId={service.publicId}
                tenantPublicId={tenantPublicId}
              />
            ) : (
              <div style={{ width: '100px', height: '100px', backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
            )}
          </div>

          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#999', marginBottom: '0.5rem' }}>
              Serviço
            </h3>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Status:</strong>{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  backgroundColor: service.active ? '#d1fae5' : '#fee2e2',
                  color: service.active ? '#065f46' : '#991b1b',
                }}
              >
                {service.active ? 'Ativo' : 'Inativo'}
              </span>
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Duração:</strong> {service.durationMinutes} min
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Preço:</strong> R$ {(service.priceCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {tab === 'info' && (
        <div style={{ maxWidth: '600px' }}>
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
          >
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nome</span>
              <input
                type="text"
                defaultValue={service.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Descrição</span>
              <textarea
                defaultValue={service.description || ''}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value || undefined }))}
                style={{ marginTop: '0.5rem', minHeight: '100px' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Alt de imagem</span>
              <input
                type="text"
                defaultValue={service.imageAlt || ''}
                onChange={(e) => setFormData((f) => ({ ...f, imageAlt: e.target.value || undefined }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Cor</span>
              <input
                type="color"
                defaultValue={service.color}
                onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            {update.error instanceof Error && (
              <p className="form-error">{update.error.message}</p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="secondary-button" onClick={() => setFormData(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={update.isPending}>
                {update.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'image' && (
        <div style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            {service.imageUrl ? (
              <PlatformServiceImage
                alt={service.name}
                servicePublicId={service.publicId}
                tenantPublicId={tenantPublicId}
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
          <button className="primary-button" onClick={() => setImageModalOpen(true)}>
            Gerenciar imagem
          </button>
        </div>
      )}

      {tab === 'category' && (
        <div style={{ maxWidth: '400px' }}>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Categoria: <strong>{service.categoryPublicId ? 'Vinculado' : 'Não vinculado'}</strong>
          </p>
          <p style={{ fontSize: '0.875rem', color: '#999' }}>
            Gerenciar categorias está disponível na aba Categorias.
          </p>
        </div>
      )}

      {tab === 'pricing' && (
        <div style={{ maxWidth: '400px' }}>
          <p style={{ margin: '0.5rem 0' }}>
            <strong>Duração:</strong> {service.durationMinutes} minutos
          </p>
          <p style={{ margin: '0.5rem 0' }}>
            <strong>Preço:</strong> R$ {(service.priceCents / 100).toFixed(2)}
          </p>
          <p style={{ margin: '0.5rem 0' }}>
            <strong>Modo de preço:</strong> {service.pricingMode}
          </p>
          <p style={{ margin: '0.5rem 0' }}>
            <strong>Pausa pós-serviço:</strong> {service.hasPostServiceBreak ? 'Sim' : 'Não'}
            {service.hasPostServiceBreak && ` (${service.postServiceBreakMinutes} min)`}
          </p>
          {service.quoteNotice && (
            <p style={{ margin: '0.5rem 0' }}>
              <strong>Aviso de orçamento:</strong> {service.quoteNotice}
            </p>
          )}
          <p style={{ fontSize: '0.875rem', color: '#999', marginTop: '1rem' }}>
            Edite esses dados na aba Informações.
          </p>
        </div>
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
    </div>
  );
}
