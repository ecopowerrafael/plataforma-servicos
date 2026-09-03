import { ProfessionalPublicSchema, UpdateProfessionalRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { PlatformProfessionalPhoto } from './PlatformProfessionalPhoto.js';
import { ProfessionalPhotoModal } from './ProfessionalPhotoModal.js';
import { ProfessionalPasswordModal } from './ProfessionalPasswordModal.js';

type Professional = z.infer<typeof ProfessionalPublicSchema>;

export function ProfessionalDetailPage({ tenantPublicId }: { tenantPublicId: string }) {
  const { professionalPublicId } = useParams<{ professionalPublicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'overview' | 'profile' | 'photo' | 'access'>('overview');
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Professional> | null>(null);

  const { data: professional, isLoading, error } = useQuery({
    queryKey: ['platform-professional', tenantPublicId, professionalPublicId],
    queryFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}`,
        { schema: ProfessionalPublicSchema },
      ),
  });

  const update = useMutation({
    mutationFn: (body: z.infer<typeof UpdateProfessionalRequestSchema>) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}`,
        {
          method: 'PATCH',
          body,
          schema: ProfessionalPublicSchema,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-professional', tenantPublicId],
      });
      setFormData(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/${
          active ? 'activate' : 'deactivate'
        }`,
        { method: 'POST', schema: z.object({ success: z.boolean() }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-professional', tenantPublicId],
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
  if (!professional) return <p>Profissional não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'profile' as const, label: 'Perfil' },
    { key: 'photo' as const, label: 'Foto' },
    { key: 'access' as const, label: 'Acesso / Senha' },
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
          <div style={{ textAlign: 'center' }}>
            {professional.photoUrl ? (
              <PlatformProfessionalPhoto
                alt={professional.name}
                professionalPublicId={professional.publicId}
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
                }}
              >
                Sem foto
              </div>
            )}
          </div>

          <div>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem' }}>{professional.name}</h1>
            <p style={{ margin: '0 0 1rem 0', color: '#666', fontSize: '1.1rem' }}>
              {professional.publicName}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor: professional.active ? '#d1fae5' : '#fee2e2',
                  color: professional.active ? '#065f46' : '#991b1b',
                }}
              >
                {professional.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => toggleActive.mutate(!professional.active)}
              disabled={toggleActive.isPending}
              className={professional.active ? 'danger-button' : 'primary-button'}
            >
              {professional.active ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
        <article className="platform-panel">
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999', margin: '0 0 1rem 0', textTransform: 'uppercase' }}>
            Contato
          </h3>
          <dl className="platform-details">
            <div>
              <dt>Telefone</dt>
              <dd>{professional.phone || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{professional.email || '—'}</dd>
            </div>
            <div>
              <dt>CPF/CNPJ</dt>
              <dd>{professional.professionalDocument || '—'}</dd>
            </div>
          </dl>
        </article>

        <article className="platform-panel">
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999', margin: '0 0 1rem 0', textTransform: 'uppercase' }}>
            Comissão
          </h3>
          <dl className="platform-details">
            <div>
              <dt>Tipo</dt>
              <dd>{professional.commissionType === 'PERCENTAGE' ? 'Percentual' : 'Valor fixo'}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>
                {professional.commissionValue}
                {professional.commissionType === 'PERCENTAGE' ? '%' : ' R$'}
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <nav aria-label="Abas do profissional" className="prospecting-tabs">
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
        <article className="platform-panel">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
            <dl className="platform-details">
              <div>
                <dt>Ordem</dt>
                <dd>{professional.sortOrder}</dd>
              </div>
              <div>
                <dt>Especialidades</dt>
                <dd>{professional.specialties?.join(', ') || '—'}</dd>
              </div>
            </dl>
          </div>
        </article>
      )}

      {tab === 'profile' && (
        <article className="platform-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!formData) return;
              update.mutate({
                name: formData.name || professional.name,
                publicName: formData.publicName || professional.publicName,
                bio: formData.bio ?? undefined,
                phone: formData.phone ?? undefined,
                email: formData.email ?? undefined,
                professionalDocument: formData.professionalDocument ?? undefined,
                specialties: formData.specialties ?? professional.specialties,
                calendarColor: formData.calendarColor ?? professional.calendarColor,
                sortOrder: formData.sortOrder ?? professional.sortOrder,
                primaryUnitPublicId: formData.primaryUnitPublicId ?? professional.primaryUnitPublicId,
                userPublicId: formData.userPublicId ?? professional.userPublicId,
                commissionType: formData.commissionType ?? professional.commissionType,
                commissionValue: formData.commissionValue ?? professional.commissionValue,
                customFields: formData.customFields ?? professional.customFields,
              } as any);
            }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}
          >
            <label>
              <span>Nome</span>
              <input
                type="text"
                defaultValue={professional.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              />
            </label>

            <label>
              <span>Nome de exibição</span>
              <input
                type="text"
                defaultValue={professional.publicName}
                onChange={(e) => setFormData((f) => ({ ...f, publicName: e.target.value }))}
              />
            </label>

            <label>
              <span>Telefone</span>
              <input
                type="tel"
                defaultValue={professional.phone || ''}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value || null }))}
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                defaultValue={professional.email || ''}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value || null }))}
              />
            </label>

            <label>
              <span>CPF/CNPJ</span>
              <input
                type="text"
                defaultValue={professional.professionalDocument || ''}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, professionalDocument: e.target.value || null }))
                }
              />
            </label>

            <label>
              <span>Cor do calendário</span>
              <input
                type="color"
                defaultValue={professional.calendarColor}
                onChange={(e) => setFormData((f) => ({ ...f, calendarColor: e.target.value }))}
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

      {tab === 'photo' && (
        <article className="platform-panel">
          <div style={{ textAlign: 'center' }}>
            {professional.photoUrl ? (
              <PlatformProfessionalPhoto
                alt={professional.name}
                professionalPublicId={professional.publicId}
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
                Sem foto
              </div>
            )}
          </div>
          <div className="form-actions">
            <button className="primary-button" onClick={() => setPhotoModalOpen(true)}>
              Gerenciar foto
            </button>
          </div>
        </article>
      )}

      {tab === 'access' && (
        <article className="platform-panel">
          <div style={{ padding: '1rem', backgroundColor: professional.userPublicId ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', marginBottom: '1rem' }}>
            {professional.userPublicId ? (
              <p style={{ color: '#065f46', margin: 0 }}>✓ Conta vinculada e ativa</p>
            ) : (
              <p style={{ color: '#991b1b', margin: 0 }}>Nenhuma conta vinculada</p>
            )}
          </div>
          {professional.userPublicId && (
            <div className="form-actions">
              <button className="primary-button" onClick={() => setPasswordModalOpen(true)}>
                Alterar senha
              </button>
            </div>
          )}
        </article>
      )}

      {photoModalOpen && (
        <ProfessionalPhotoModal
          professional={professional}
          tenantPublicId={tenantPublicId}
          onClose={() => setPhotoModalOpen(false)}
          onPhotoUpdated={() => {
            queryClient.invalidateQueries({
              queryKey: ['platform-professional', tenantPublicId],
            });
          }}
        />
      )}

      {passwordModalOpen && professional.userPublicId && (
        <ProfessionalPasswordModal
          professional={professional}
          tenantPublicId={tenantPublicId}
          onClose={() => setPasswordModalOpen(false)}
        />
      )}
    </section>
  );
}
