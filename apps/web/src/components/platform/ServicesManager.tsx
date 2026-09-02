import {
  CreateServiceRequestSchema,
  UpdateServiceRequestSchema,
  ServicePublicSchema,
  ServiceListResponseSchema,
  ServiceCategoryListResponseSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState, formatMoney, StatusBadge } from './PlatformUi.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

const HEX = /^#[0-9A-Fa-f]{6}$/u;

interface ServiceFormData {
  name: string;
  description: string;
  imageAlt: string;
  iconKey: string;
  categoryPublicId: string;
  durationMinutes: string;
  hasPostServiceBreak: boolean;
  postServiceBreakMinutes: string;
  priceCents: string;
  pricingMode: 'FIXED' | 'QUOTE';
  quoteNotice: string;
  color: string;
  sortOrder: string;
  active: boolean;
}

function emptyForm(): ServiceFormData {
  return {
    name: '',
    description: '',
    imageAlt: '',
    iconKey: '',
    categoryPublicId: '',
    durationMinutes: '30',
    hasPostServiceBreak: false,
    postServiceBreakMinutes: '0',
    priceCents: '0',
    pricingMode: 'FIXED',
    quoteNotice: '',
    color: '#000000',
    sortOrder: '0',
    active: true,
  };
}

function fromService(s: z.infer<typeof ServicePublicSchema>): ServiceFormData {
  return {
    name: s.name,
    description: s.description ?? '',
    imageAlt: s.imageAlt ?? '',
    iconKey: s.iconKey ?? '',
    categoryPublicId: s.categoryPublicId ?? '',
    durationMinutes: String(s.durationMinutes),
    hasPostServiceBreak: s.hasPostServiceBreak,
    postServiceBreakMinutes: String(s.postServiceBreakMinutes),
    priceCents: s.priceCents,
    pricingMode: s.pricingMode,
    quoteNotice: s.quoteNotice ?? '',
    color: s.color,
    sortOrder: String(s.sortOrder),
    active: s.active,
  };
}

export function ServicesManager({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<z.infer<typeof ServicePublicSchema> | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [imageUploadingFor, setImageUploadingFor] = useState<string | null>(null);

  const queryKey = [
    'platform',
    'tenant',
    tenantPublicId,
    'services',
    { page, search, categoryFilter, activeFilter },
  ];

  const services = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search ? { search } : {}),
        ...(categoryFilter ? { categoryPublicId: categoryFilter } : {}),
        ...(activeFilter !== 'all' ? { active: String(activeFilter === 'active') } : {}),
      });
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/services?${params}`,
        { schema: ServiceListResponseSchema },
      );
    },
    retry: false,
  });

  const categories = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'service-categories'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/service-categories?page=1&limit=1000`, {
        schema: ServiceCategoryListResponseSchema,
      }),
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      try {
        const body = {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          imageAlt: formData.imageAlt.trim() || null,
          iconKey: formData.iconKey.trim() || null,
          categoryPublicId: formData.categoryPublicId || null,
          durationMinutes: Number(formData.durationMinutes),
          hasPostServiceBreak: formData.hasPostServiceBreak,
          postServiceBreakMinutes: Number(formData.postServiceBreakMinutes),
          priceCents: Number(formData.priceCents),
          pricingMode: formData.pricingMode,
          quoteNotice: formData.quoteNotice.trim() || null,
          color: formData.color,
          sortOrder: Number(formData.sortOrder),
          ...(editingService ? { active: formData.active } : { active: true }),
        };

        if (editingService) {
          return await httpClient.request(
            `/platform/tenants/${tenantPublicId}/services/${editingService.publicId}`,
            {
              method: 'PATCH',
              body,
              schema: ServicePublicSchema,
            },
          );
        } else {
          return await httpClient.request(
            `/platform/tenants/${tenantPublicId}/services`,
            {
              method: 'POST',
              body,
              schema: ServicePublicSchema,
            },
          );
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error('Erro ao salvar serviço');
      }
    },
    onSuccess: async () => {
      setShowForm(false);
      setEditingService(null);
      setFormData(emptyForm());
      setFormError(null);
      await client.invalidateQueries({ queryKey });
      setPage(1);
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!editingService) return;
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${editingService.publicId}/image`,
        {
          method: 'PUT',
          body,
          schema: ServicePublicSchema,
        },
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
      setImageUploadingFor(null);
    },
  });

  const removeImage = useMutation({
    mutationFn: async (servicePublicId: string) => {
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${servicePublicId}/image`,
        { method: 'DELETE', schema: SuccessResponseSchema },
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ servicePublicId, active }: { servicePublicId: string; active: boolean }) => {
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${servicePublicId}/${active ? 'activate' : 'deactivate'}`,
        { method: 'POST', schema: SuccessResponseSchema },
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
    },
  });

  const openCreate = () => {
    setEditingService(null);
    setFormData(emptyForm());
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (service: z.infer<typeof ServicePublicSchema>) => {
    setEditingService(service);
    setFormData(fromService(service));
    setFormError(null);
    setShowForm(true);
  };

  const openDeleteImage = (service: z.infer<typeof ServicePublicSchema>) => {
    if (!service.imageUrl) return;
    setConfirmation({
      title: 'Remover imagem',
      description: `Remover imagem do serviço "${service.name}"?`,
      confirmLabel: 'Remover',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        removeImage.mutate(service.publicId);
      },
    });
  };

  const openDeactivate = (service: z.infer<typeof ServicePublicSchema>) => {
    setConfirmation({
      title: 'Desativar serviço',
      description: `Desativar serviço "${service.name}"?`,
      confirmLabel: 'Desativar',
      requiresReason: false,
      onConfirm: async () => {
        setActive.mutate({ servicePublicId: service.publicId, active: false });
      },
    });
  };

  if (services.isPending) return <i className="platform-skeleton" />;
  if (services.error instanceof Error || services.data === undefined)
    return (
      <ErrorState
        message={services.error instanceof Error ? services.error.message : 'Não foi possível carregar os serviços.'}
        retry={() => {
          void services.refetch();
        }}
      />
    );

  const data = services.data;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {confirmation && <ConfirmationDialog request={confirmation} onClose={() => setConfirmation(null)} />}

      <section className="platform-panel">
        <header>
          <h3>Serviços</h3>
          <button className="primary-button button--sm" type="button" onClick={openCreate}>
            + Novo serviço
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <label>
            Busca
            <input
              type="text"
              placeholder="Nome..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="control-sm"
            />
          </label>
          <label>
            Categoria
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="control-sm"
            >
              <option value="">Todas</option>
              {categories.data?.items.map((cat) => (
                <option key={cat.publicId} value={cat.publicId}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as any);
                setPage(1);
              }}
              className="control-sm"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </div>

        {data.items.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Duração</th>
                    <th>Preço</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((service) => (
                    <tr key={service.publicId}>
                      <td>
                        <strong>{service.name}</strong>
                        {service.imageUrl && <div style={{ fontSize: '0.75rem', color: '#999' }}>📷 tem imagem</div>}
                      </td>
                      <td>{service.categoryName ?? '—'}</td>
                      <td>{service.durationMinutes}m</td>
                      <td>
                        {service.pricingMode === 'QUOTE'
                          ? service.quoteNotice || 'Sob orçamento'
                          : `R$ ${(Number(service.priceCents) / 100).toFixed(2)}`}
                      </td>
                      <td><StatusBadge value={service.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                      <td style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="text-button button--xs"
                          onClick={() => openEdit(service)}
                        >
                          Editar
                        </button>
                        {service.active ? (
                          <button
                            type="button"
                            className="text-button button--xs"
                            onClick={() => openDeactivate(service)}
                          >
                            Desativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-button button--xs"
                            onClick={() => setActive.mutate({ servicePublicId: service.publicId, active: true })}
                          >
                            Ativar
                          </button>
                        )}
                        {service.imageUrl ? (
                          <button
                            type="button"
                            className="text-button button--xs"
                            onClick={() => openDeleteImage(service)}
                          >
                            Remover img
                          </button>
                        ) : (
                          <label className="text-button button--xs" style={{ cursor: 'pointer', margin: 0 }}>
                            Enviar img
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setImageUploadingFor(service.publicId);
                                  uploadImage.mutate(file);
                                }
                                e.target.value = '';
                              }}
                              disabled={uploadImage.isPending}
                            />
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.page.totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="secondary-button button--sm"
                >
                  Anterior
                </button>
                <span style={{ padding: '0.5rem' }}>
                  Página {page} de {data.page.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= data.page.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="secondary-button button--sm"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Nenhum serviço encontrado.</p>
        )}
      </section>

      {showForm && (
        <div className="dialog-backdrop" onClick={() => !save.isPending && setShowForm(false)}>
          <section
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h2>{editingService ? `Editar: ${editingService.name}` : 'Novo serviço'}</h2>
            {formError && <p className="form-error">{formError}</p>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <label>
                Nome *
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="control-lg"
                  required
                />
              </label>

              <label>
                Descrição
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  maxLength={1000}
                />
              </label>

              <label>
                Categoria
                <select
                  value={formData.categoryPublicId}
                  onChange={(e) => setFormData({ ...formData, categoryPublicId: e.target.value })}
                  className="control-sm"
                >
                  <option value="">Sem categoria</option>
                  {categories.data?.items.map((cat) => (
                    <option key={cat.publicId} value={cat.publicId}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Duração (minutos) *
                <input
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                  className="control-sm"
                  min="1"
                  max="1440"
                  required
                />
              </label>

              <label>
                Modelo de preço *
                <select
                  value={formData.pricingMode}
                  onChange={(e) => setFormData({ ...formData, pricingMode: e.target.value as any })}
                  className="control-sm"
                >
                  <option value="FIXED">Preço fixo</option>
                  <option value="QUOTE">Sob orçamento</option>
                </select>
              </label>

              {formData.pricingMode === 'FIXED' && (
                <label>
                  Preço (centavos) *
                  <input
                    type="number"
                    value={formData.priceCents}
                    onChange={(e) => setFormData({ ...formData, priceCents: e.target.value })}
                    className="control-sm"
                    min="0"
                    required
                  />
                </label>
              )}

              {formData.pricingMode === 'QUOTE' && (
                <label>
                  Texto exibido no lugar do preço
                  <input
                    type="text"
                    value={formData.quoteNotice}
                    onChange={(e) => setFormData({ ...formData, quoteNotice: e.target.value })}
                    className="control-lg"
                    placeholder="Ex: Valor sob orçamento"
                    maxLength={160}
                  />
                </label>
              )}

              <label>
                Cor (#RRGGBB) *
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value.toUpperCase() })}
                  className="control-sm"
                  required
                />
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={formData.hasPostServiceBreak}
                  onChange={(e) => setFormData({ ...formData, hasPostServiceBreak: e.target.checked })}
                />
                Incluir pausa após serviço
              </label>

              {formData.hasPostServiceBreak && (
                <label>
                  Duração da pausa (minutos) *
                  <input
                    type="number"
                    value={formData.postServiceBreakMinutes}
                    onChange={(e) => setFormData({ ...formData, postServiceBreakMinutes: e.target.value })}
                    className="control-sm"
                    min="1"
                    max="240"
                    required
                  />
                </label>
              )}

              <label>
                Ordem de exibição (0-999)
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  className="control-sm"
                  min="0"
                  max="999"
                />
              </label>

              <label>
                Text Alt (imagem)
                <input
                  type="text"
                  value={formData.imageAlt}
                  onChange={(e) => setFormData({ ...formData, imageAlt: e.target.value })}
                  className="control-lg"
                  maxLength={160}
                  placeholder="Descrição da imagem para acessibilidade"
                />
              </label>

              <label>
                Ícone (identificador do catálogo)
                <input
                  type="text"
                  value={formData.iconKey}
                  onChange={(e) => setFormData({ ...formData, iconKey: e.target.value })}
                  className="control-lg"
                  maxLength={60}
                />
              </label>

              {editingService && (
                <label>
                  <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />
                  Ativo
                </label>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={save.isPending}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={save.isPending}>
                  {save.isPending ? 'Salvando…' : editingService ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
