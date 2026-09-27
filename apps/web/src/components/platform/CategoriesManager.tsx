import {
  CreateServiceCategoryRequestSchema,
  UpdateServiceCategoryRequestSchema,
  ServiceCategoryPublicSchema,
  ServiceCategoryListResponseSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState, StatusBadge } from './PlatformUi.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

interface CategoryFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: string;
  active: boolean;
}

function emptyForm(): CategoryFormData {
  return {
    name: '',
    description: '',
    color: '#000000',
    icon: '',
    sortOrder: '0',
    active: true,
  };
}

function fromCategory(c: z.infer<typeof ServiceCategoryPublicSchema>): CategoryFormData {
  return {
    name: c.name,
    description: c.description ?? '',
    color: c.color,
    icon: c.icon ?? '',
    sortOrder: String(c.sortOrder),
    active: c.active,
  };
}

export function CategoriesManager({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<z.infer<typeof ServiceCategoryPublicSchema> | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const queryKey = [
    'platform',
    'tenant',
    tenantPublicId,
    'service-categories',
    { page, search, activeFilter },
  ];

  const categories = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search ? { search } : {}),
        ...(activeFilter !== 'all' ? { active: String(activeFilter === 'active') } : {}),
      });
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/service-categories?${params}`,
        { schema: ServiceCategoryListResponseSchema },
      );
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      try {
        const body = {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          color: formData.color,
          icon: formData.icon.trim() || null,
          sortOrder: Number(formData.sortOrder),
          ...(editingCategory ? { active: formData.active } : { active: true }),
        };

        if (editingCategory) {
          return await httpClient.request(
            `/platform/tenants/${tenantPublicId}/service-categories/${editingCategory.publicId}`,
            {
              method: 'PATCH',
              body,
              schema: ServiceCategoryPublicSchema,
            },
          );
        } else {
          return await httpClient.request(
            `/platform/tenants/${tenantPublicId}/service-categories`,
            {
              method: 'POST',
              body,
              schema: ServiceCategoryPublicSchema,
            },
          );
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error('Erro ao salvar categoria');
      }
    },
    onSuccess: async () => {
      setShowForm(false);
      setEditingCategory(null);
      setFormData(emptyForm());
      setFormError(null);
      await client.invalidateQueries({ queryKey });
      setPage(1);
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ categoryPublicId, active }: { categoryPublicId: string; active: boolean }) => {
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/service-categories/${categoryPublicId}/${active ? 'activate' : 'deactivate'}`,
        { method: 'POST', schema: SuccessResponseSchema },
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
    },
  });

  const openCreate = () => {
    setEditingCategory(null);
    setFormData(emptyForm());
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (category: z.infer<typeof ServiceCategoryPublicSchema>) => {
    setEditingCategory(category);
    setFormData(fromCategory(category));
    setFormError(null);
    setShowForm(true);
  };

  const openDeactivate = (category: z.infer<typeof ServiceCategoryPublicSchema>) => {
    setConfirmation({
      title: 'Desativar categoria',
      description: `Desativar categoria "${category.name}"?`,
      confirmLabel: 'Desativar',
      requiresReason: false,
      onConfirm: async () => {
        setActive.mutate({ categoryPublicId: category.publicId, active: false });
      },
    });
  };

  if (categories.isPending) return <i className="platform-skeleton" />;
  if (categories.error instanceof Error || categories.data === undefined)
    return (
      <ErrorState
        message={categories.error instanceof Error ? categories.error.message : 'Não foi possível carregar as categorias.'}
        retry={() => {
          void categories.refetch();
        }}
      />
    );

  const data = categories.data;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {confirmation && <ConfirmationDialog request={confirmation} onClose={() => setConfirmation(null)} />}

      <section className="platform-panel">
        <header>
          <h3>Categorias de Serviços</h3>
          <button className="primary-button button--sm" type="button" onClick={openCreate}>
            + Nova categoria
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
            Status
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as any);
                setPage(1);
              }}
              className="control-sm"
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
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
                    <th>Serviços</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((category) => (
                    <tr key={category.publicId}>
                      <td>
                        <strong>{category.name}</strong>
                        {category.description && <div style={{ fontSize: '0.75rem', color: '#999' }}>{category.description}</div>}
                      </td>
                      <td>{category.serviceCount ?? 0}</td>
                      <td><StatusBadge value={category.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                      <td style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="text-button button--xs"
                          onClick={() => openEdit(category)}
                        >
                          Editar
                        </button>
                        {category.active ? (
                          <button
                            type="button"
                            className="text-button button--xs"
                            onClick={() => openDeactivate(category)}
                          >
                            Desativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-button button--xs"
                            onClick={() => setActive.mutate({ categoryPublicId: category.publicId, active: true })}
                          >
                            Ativar
                          </button>
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
          <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Nenhuma categoria encontrada.</p>
        )}
      </section>

      {showForm && (
        <div className="dialog-backdrop" onClick={() => !save.isPending && setShowForm(false)}>
          <section
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h2>{editingCategory ? `Editar: ${editingCategory.name}` : 'Nova categoria'}</h2>
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
                  maxLength={500}
                />
              </label>

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
                Ícone (identificador do catálogo)
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="control-lg"
                  maxLength={64}
                />
              </label>

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

              {editingCategory && (
                <label>
                  <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />
                  Ativa
                </label>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={save.isPending}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={save.isPending}>
                  {save.isPending ? 'Salvando…' : editingCategory ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
