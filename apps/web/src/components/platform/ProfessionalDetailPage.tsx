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

  if (isLoading) return <p style={{ padding: '2rem' }}>Carregando…</p>;
  if (error instanceof Error)
    return (
      <div style={{ padding: '2rem' }}>
        <ErrorState error={error.message} />
      </div>
    );
  if (!professional) return <p style={{ padding: '2rem' }}>Profissional não encontrado.</p>;

  const tabs = [
    { key: 'overview' as const, label: 'Visão geral' },
    { key: 'profile' as const, label: 'Perfil' },
    { key: 'photo' as const, label: 'Foto' },
    { key: 'access' as const, label: 'Acesso / Senha' },
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
          <h1>{professional.name}</h1>
          <p style={{ color: '#666' }}>{professional.publicName}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => toggleActive.mutate(!professional.active)}
            disabled={toggleActive.isPending}
            className={professional.active ? 'danger-button' : 'primary-button'}
          >
            {professional.active ? 'Desativar' : 'Ativar'}
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
              Foto
            </h3>
            {professional.photoUrl ? (
              <PlatformProfessionalPhoto
                alt={professional.name}
                professionalPublicId={professional.publicId}
                tenantPublicId={tenantPublicId}
              />
            ) : (
              <div style={{ width: '100px', height: '100px', backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
            )}
          </div>

          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#999', marginBottom: '0.5rem' }}>
              Contato
            </h3>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Telefone:</strong> {professional.phone || '—'}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Email:</strong> {professional.email || '—'}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>CPF/CNPJ:</strong> {professional.professionalDocument || '—'}
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#999', marginBottom: '0.5rem' }}>
              Informações
            </h3>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Status:</strong>{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  backgroundColor: professional.active ? '#d1fae5' : '#fee2e2',
                  color: professional.active ? '#065f46' : '#991b1b',
                }}
              >
                {professional.active ? 'Ativo' : 'Inativo'}
              </span>
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Ordem:</strong> {professional.sortOrder}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Comissão:</strong> {professional.commissionValue}
              {professional.commissionType === 'PERCENTAGE' ? '%' : ' R$'}
            </p>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div style={{ maxWidth: '600px' }}>
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
          >
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nome</span>
              <input
                type="text"
                defaultValue={professional.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nome de exibição</span>
              <input
                type="text"
                defaultValue={professional.publicName}
                onChange={(e) => setFormData((f) => ({ ...f, publicName: e.target.value }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Telefone</span>
              <input
                type="tel"
                defaultValue={professional.phone || ''}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value || null }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Email</span>
              <input
                type="email"
                defaultValue={professional.email || ''}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value || null }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>CPF/CNPJ</span>
              <input
                type="text"
                defaultValue={professional.professionalDocument || ''}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, professionalDocument: e.target.value || null }))
                }
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Cor do calendário</span>
              <input
                type="color"
                defaultValue={professional.calendarColor}
                onChange={(e) => setFormData((f) => ({ ...f, calendarColor: e.target.value }))}
                style={{ marginTop: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Comissão</span>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <select
                  defaultValue={professional.commissionType}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      commissionType: e.target.value as 'PERCENTAGE' | 'FIXED',
                    }))
                  }
                  style={{ flex: 1 }}
                >
                  <option value="PERCENTAGE">Percentual (%)</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                </select>
                <input
                  type="number"
                  defaultValue={professional.commissionValue}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      commissionValue: parseInt(e.target.value) || 0,
                    }))
                  }
                  style={{ flex: 1 }}
                />
              </div>
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

      {tab === 'photo' && (
        <div style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            {professional.photoUrl ? (
              <PlatformProfessionalPhoto
                alt={professional.name}
                professionalPublicId={professional.publicId}
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
                Sem foto
              </div>
            )}
          </div>
          <button className="primary-button" onClick={() => setPhotoModalOpen(true)}>
            Gerenciar foto
          </button>
        </div>
      )}

      {tab === 'access' && (
        <div style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            {professional.userPublicId ? (
              <p style={{ color: '#065f46' }}>✓ Conta vinculada e ativa</p>
            ) : (
              <p style={{ color: '#991b1b' }}>Nenhuma conta vinculada</p>
            )}
          </div>
          {professional.userPublicId && (
            <button className="primary-button" onClick={() => setPasswordModalOpen(true)}>
              Alterar senha
            </button>
          )}
        </div>
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
    </div>
  );
}
