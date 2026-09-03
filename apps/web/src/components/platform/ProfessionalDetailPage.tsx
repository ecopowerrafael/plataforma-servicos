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
  if (error instanceof Error) return <ErrorState error={error.message} />;
  if (!professional) return <p>Profissional não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'profile' as const, label: 'Perfil' },
    { key: 'photo' as const, label: 'Foto' },
    { key: 'access' as const, label: 'Acesso / Senha' },
  ];

  return (
    <>
      <div className="platform-entity-header">
        <div className="platform-entity-avatar">
          {professional.photoUrl ? (
            <PlatformProfessionalPhoto
              alt={professional.name}
              professionalPublicId={professional.publicId}
              tenantPublicId={tenantPublicId}
              variant="original"
              size={{ width: 88, height: 88 }}
            />
          ) : (
            <div className="platform-entity-avatar-placeholder" />
          )}
        </div>

        <div className="platform-entity-info">
          <h1>{professional.name}</h1>
          <p className="platform-entity-subtitle">{professional.publicName}</p>
          <div className="platform-entity-status">
            <span className={professional.active ? 'status-active' : 'status-inactive'}>
              {professional.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>

        <div className="platform-entity-actions">
          <button
            onClick={() => toggleActive.mutate(!professional.active)}
            disabled={toggleActive.isPending}
            className={professional.active ? 'action-button danger' : 'action-button primary'}
          >
            {professional.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      <div className="platform-entity-summary">
        <article className="platform-panel">
          <h3>Contato</h3>
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
          <h3>Comissão</h3>
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
                <dt>Ordem</dt>
                <dd>{professional.sortOrder}</dd>
              </div>
              <div>
                <dt>Especialidades</dt>
                <dd>{professional.specialties?.join(', ') || '—'}</dd>
              </div>
            </dl>
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
              className="platform-form"
            >
              <div className="platform-form-grid">
                <label className="platform-form-field">
                  <span>Nome</span>
                  <input
                    type="text"
                    defaultValue={professional.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Nome de exibição</span>
                  <input
                    type="text"
                    defaultValue={professional.publicName}
                    onChange={(e) => setFormData((f) => ({ ...f, publicName: e.target.value }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Telefone</span>
                  <input
                    type="tel"
                    defaultValue={professional.phone || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value || null }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>Email</span>
                  <input
                    type="email"
                    defaultValue={professional.email || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value || null }))}
                  />
                </label>

                <label className="platform-form-field">
                  <span>CPF/CNPJ</span>
                  <input
                    type="text"
                    defaultValue={professional.professionalDocument || ''}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, professionalDocument: e.target.value || null }))
                    }
                  />
                </label>

                <label className="platform-form-field">
                  <span>Cor do calendário</span>
                  <input
                    type="color"
                    defaultValue={professional.calendarColor}
                    onChange={(e) => setFormData((f) => ({ ...f, calendarColor: e.target.value }))}
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

        {tab === 'photo' && (
          <article className="platform-panel">
            <div className="platform-image-preview">
              {professional.photoUrl ? (
                <PlatformProfessionalPhoto
                  alt={professional.name}
                  professionalPublicId={professional.publicId}
                  tenantPublicId={tenantPublicId}
                  variant="original"
                  size={{ width: 240, height: 240 }}
                />
              ) : (
                <div className="platform-image-placeholder">Sem foto</div>
              )}
            </div>
            <div className="platform-form-actions">
              <button className="action-button primary" onClick={() => setPhotoModalOpen(true)}>
                Gerenciar foto
              </button>
            </div>
          </article>
        )}

        {tab === 'access' && (
          <article className="platform-panel">
            <div className="platform-account-status">
              {professional.userPublicId ? (
                <p className="status-active">✓ Conta vinculada e ativa</p>
              ) : (
                <p className="status-inactive">Nenhuma conta vinculada</p>
              )}
            </div>
            {professional.userPublicId && (
              <div className="platform-form-actions">
                <button className="action-button primary" onClick={() => setPasswordModalOpen(true)}>
                  Alterar senha
                </button>
              </div>
            )}
          </article>
        )}
      </div>

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
    </>
  );
}
