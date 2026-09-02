import {
  CreateProfessionalRequestSchema,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
  UpdateProfessionalRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { PlatformProfessionalPhoto } from './PlatformProfessionalPhoto.js';
import { ProfessionalPhotoModal } from './ProfessionalPhotoModal.js';
import { ProfessionalPasswordModal } from './ProfessionalPasswordModal.js';

interface ProfessionalsManagerProps {
  tenantPublicId: string;
}

type Professional = z.infer<typeof ProfessionalPublicSchema>;

export function ProfessionalsManager({ tenantPublicId }: ProfessionalsManagerProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [photoModalService, setPhotoModalService] = useState<Professional | null>(null);
  const [passwordModalService, setPasswordModalService] = useState<Professional | null>(null);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);

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

  const create = useMutation({
    mutationFn: (body: z.infer<typeof CreateProfessionalRequestSchema>) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals`, {
        method: 'POST',
        body,
        schema: ProfessionalPublicSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-professionals', tenantPublicId],
      });
      setShowCreateModal(false);
      setFormData(getDefaultFormData());
    },
  });

  const update = useMutation({
    mutationFn: (body: z.infer<typeof UpdateProfessionalRequestSchema>) => {
      if (!editingProfessional) throw new Error('No professional selected');
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${editingProfessional.publicId}`,
        {
          method: 'PATCH',
          body,
          schema: ProfessionalPublicSchema,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-professionals', tenantPublicId],
      });
      setEditingProfessional(null);
      setFormData(getDefaultFormData());
    },
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

  const defaultFormData = getDefaultFormData();
  const [formData, setFormData] = useState(defaultFormData);

  function getDefaultFormData() {
    return {
      name: '',
      publicName: '',
      bio: '',
      phone: '',
      email: '',
      professionalDocument: '',
      specialties: [] as string[],
      calendarColor: '#2563EB',
      sortOrder: 0,
      primaryUnitPublicId: null as string | null,
      userPublicId: null as string | null,
      commissionType: 'PERCENTAGE' as const,
      commissionValue: 0,
      customFields: {},
      active: true,
      password: '',
      passwordConfirmation: '',
    };
  }

  useEffect(() => {
    if (editingProfessional) {
      setFormData({
        name: editingProfessional.name,
        publicName: editingProfessional.publicName,
        bio: editingProfessional.bio ?? '',
        phone: editingProfessional.phone ?? '',
        email: editingProfessional.email ?? '',
        professionalDocument: editingProfessional.professionalDocument ?? '',
        specialties: editingProfessional.specialties ?? [],
        calendarColor: editingProfessional.calendarColor,
        sortOrder: editingProfessional.sortOrder,
        primaryUnitPublicId: editingProfessional.primaryUnitPublicId,
        userPublicId: editingProfessional.userPublicId,
        commissionType: editingProfessional.commissionType,
        commissionValue: editingProfessional.commissionValue,
        customFields: editingProfessional.customFields ?? {},
        active: editingProfessional.active,
        password: '',
        passwordConfirmation: '',
      });
    }
  }, [editingProfessional]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProfessional) {
      update.mutate({
        name: formData.name,
        publicName: formData.publicName,
        bio: formData.bio || null,
        phone: formData.phone || null,
        email: formData.email || null,
        professionalDocument: formData.professionalDocument || null,
        specialties: formData.specialties,
        calendarColor: formData.calendarColor,
        sortOrder: formData.sortOrder,
        primaryUnitPublicId: formData.primaryUnitPublicId,
        userPublicId: formData.userPublicId,
        commissionType: formData.commissionType,
        commissionValue: formData.commissionValue,
        customFields: formData.customFields,
        active: formData.active,
      } as any);
    } else {
      create.mutate({
        name: formData.name,
        publicName: formData.publicName,
        bio: formData.bio || null,
        phone: formData.phone || null,
        email: formData.email || null,
        professionalDocument: formData.professionalDocument || null,
        specialties: formData.specialties,
        calendarColor: formData.calendarColor,
        sortOrder: formData.sortOrder,
        primaryUnitPublicId: formData.primaryUnitPublicId,
        userPublicId: formData.userPublicId,
        commissionType: formData.commissionType,
        commissionValue: formData.commissionValue,
        customFields: formData.customFields,
        active: formData.active,
        password: formData.password || undefined,
        passwordConfirmation: formData.passwordConfirmation || undefined,
      } as any);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Profissionais</h2>
        <button className="primary-button" onClick={() => setShowCreateModal(true)}>
          + Novo profissional
        </button>
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
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 500 }}>{prof.name}</div>
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
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <select
                        value=""
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'edit') setEditingProfessional(prof);
                          else if (action === 'photo') setPhotoModalService(prof);
                          else if (action === 'password') setPasswordModalService(prof);
                          else if (action === 'activate')
                            toggleActive.mutate({ professional: prof, active: true });
                          else if (action === 'deactivate')
                            toggleActive.mutate({ professional: prof, active: false });
                        }}
                        style={{
                          fontSize: '0.875rem',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #d1d5db',
                        }}
                      >
                        <option value="">Ações</option>
                        <option value="edit">Editar</option>
                        <option value="photo">Foto</option>
                        <option value="password">Senha</option>
                        {prof.active ? (
                          <option value="deactivate">Desativar</option>
                        ) : (
                          <option value="activate">Ativar</option>
                        )}
                      </select>
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

      {showCreateModal && (
        <div className="dialog-backdrop" onClick={() => setShowCreateModal(false)}>
          <section
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h2>Novo profissional</h2>

            <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nome</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  minLength={2}
                  maxLength={120}
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nome de exibição</span>
                <input
                  type="text"
                  value={formData.publicName}
                  onChange={(e) => setFormData({ ...formData, publicName: e.target.value })}
                  required
                  minLength={2}
                  maxLength={120}
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Telefone</span>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Email</span>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>CPF/CNPJ</span>
                <input
                  type="text"
                  value={formData.professionalDocument}
                  onChange={(e) =>
                    setFormData({ ...formData, professionalDocument: e.target.value })
                  }
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Cor do calendário</span>
                <input
                  type="color"
                  value={formData.calendarColor}
                  onChange={(e) => setFormData({ ...formData, calendarColor: e.target.value })}
                  style={{ marginTop: '0.5rem' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Comissão</span>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <select
                    value={formData.commissionType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        commissionType: e.target.value as 'PERCENTAGE' | 'FIXED',
                      })
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="PERCENTAGE">Percentual (%)</option>
                    <option value="FIXED">Valor fixo (R$)</option>
                  </select>
                  <input
                    type="number"
                    value={formData.commissionValue}
                    onChange={(e) =>
                      setFormData({ ...formData, commissionValue: parseInt(e.target.value) || 0 })
                    }
                    min={0}
                    style={{ flex: 1 }}
                  />
                </div>
              </label>

              {!editingProfessional && (
                <>
                  <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Senha</span>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      minLength={8}
                      style={{ marginTop: '0.5rem' }}
                    />
                  </label>

                  <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      Confirmar senha
                    </span>
                    <input
                      type="password"
                      value={formData.passwordConfirmation}
                      onChange={(e) =>
                        setFormData({ ...formData, passwordConfirmation: e.target.value })
                      }
                      minLength={8}
                      style={{ marginTop: '0.5rem' }}
                    />
                  </label>

                  {formData.password && formData.passwordConfirmation && formData.password !== formData.passwordConfirmation && (
                    <p className="form-error">Senhas não conferem.</p>
                  )}
                </>
              )}

              {create.error instanceof Error && (
                <p className="form-error">{create.error.message}</p>
              )}
              {update.error instanceof Error && (
                <p className="form-error">{update.error.message}</p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingProfessional(null);
                    setFormData(getDefaultFormData());
                  }}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={create.isPending || update.isPending}
                  style={{ flex: 1 }}
                >
                  {create.isPending || update.isPending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {photoModalService && (
        <ProfessionalPhotoModal
          professional={photoModalService}
          tenantPublicId={tenantPublicId}
          onClose={() => setPhotoModalService(null)}
          onPhotoUpdated={() => {
            queryClient.invalidateQueries({
              queryKey: ['platform-professionals', tenantPublicId],
            });
          }}
        />
      )}

      {passwordModalService && (
        <ProfessionalPasswordModal
          professional={passwordModalService}
          tenantPublicId={tenantPublicId}
          onClose={() => setPasswordModalService(null)}
        />
      )}
    </div>
  );
}
