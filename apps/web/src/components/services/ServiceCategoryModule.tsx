import { CreateServiceCategoryRequestSchema, ServiceCategoryListResponseSchema, ServiceCategoryPublicSchema, ServiceCategoryStatusResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { type ZodType } from 'zod';

import { ServiceCategoryForm } from './ServiceCategoryForm.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';
import '../../styles/service-categories.css';

type StatusFilter = 'all' | 'active' | 'inactive';

export function ServiceCategoryModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deleteConfirmation, setDeleteConfirmation] = useState<ConfirmationRequest | null>(null);
  const list = useQuery({ queryKey: ['tenant', tenantPublicId, 'service-categories'], queryFn: () => httpClient.request('/tenant/service-categories?limit=100', { schema: ServiceCategoryListResponseSchema, tenantPublicId }), retry: false });
  const detail = useQuery({ queryKey: ['tenant', tenantPublicId, 'service-category', selected], queryFn: () => httpClient.request(`/tenant/service-categories/${selected ?? ''}`, { schema: ServiceCategoryPublicSchema, tenantPublicId }), enabled: selected !== null, retry: false });
  const mutation = useMutation({
    mutationFn: ({ url, method, body, schema }: { url: string; method: 'POST' | 'PATCH'; body?: unknown; schema?: ZodType }) => httpClient.request(url, { method, ...(body === undefined ? {} : { body }), schema: schema ?? ServiceCategoryPublicSchema, tenantPublicId }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service-categories'] });
      if (selected !== null) void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service-category', selected] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (publicId: string) => httpClient.request(`/tenant/service-categories/${publicId}`, { method: 'DELETE', schema: ServiceCategoryStatusResponseSchema, tenantPublicId }),
    onSuccess: async (_, publicId) => {
      setDeleteConfirmation(null);
      setSelected(null);
      setCreating(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service-categories'] }),
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service-category', publicId] }),
      ]);
    },
  });
  const items = list.data?.items ?? [];
  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesSearch = item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.active : !item.active);
    return matchesSearch && matchesStatus;
  }), [items, search, statusFilter]);
  const closeDrawer = () => { setCreating(false); setSelected(null); };
  const save = async (value: unknown) => {
    const output = await mutation.mutateAsync({ url: selected === null ? '/tenant/service-categories' : `/tenant/service-categories/${selected}`, method: selected === null ? 'POST' : 'PATCH', body: CreateServiceCategoryRequestSchema.parse(value) });
    setSelected(ServiceCategoryPublicSchema.parse(output).publicId);
    setCreating(false);
  };
  const requestDelete = (publicId: string, serviceCount: number) => {
    const services = serviceCount === 1 ? '1 serviço vinculado não será excluído. Ele ficará sem categoria.' : `${serviceCount} serviços vinculados não serão excluídos. Eles ficarão sem categoria.`;
    setDeleteConfirmation({
      title: 'Excluir categoria?',
      description: serviceCount > 0 ? services : 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir categoria',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync(publicId);
        } catch {
          throw new Error('Não foi possível excluir a categoria. Tente novamente.');
        }
      },
    });
  };
  const activeCount = items.filter((item) => item.active).length;
  const inactiveCount = items.length - activeCount;
  return <section className="service-categories-page">
    <PageHeader eyebrow="Catálogo" title="Categorias" description="Organize seus serviços por categorias para facilitar a navegação dos clientes." actions={<button className="primary-button" onClick={() => { setSelected(null); setCreating(true); }}>+ Nova categoria</button>} />
    <div className="service-category-tip"><span aria-hidden="true">ⓘ</span><span>Dica: se você possui poucos serviços, experimente usar apenas uma ou duas categorias e veja qual organização deixa seu App mais simples para o cliente.</span></div>
    <div className="service-category-stats" aria-label="Resumo das categorias">
      <div className="service-category-stat"><strong>{items.length}</strong><span>Categorias</span></div>
      <div className="service-category-stat service-category-stat--active"><strong>{activeCount}</strong><span>Ativas</span></div>
      <div className="service-category-stat service-category-stat--inactive"><strong>{inactiveCount}</strong><span>Inativas</span></div>
    </div>
    <div className="service-category-toolbar">
      <label className="service-category-search"><span className="service-category-search__icon" aria-hidden="true">⌕</span><input aria-label="Buscar categoria" placeholder="Buscar categoria..." value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
      <select aria-label="Filtrar status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); }}><option value="all">Todos</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select>
    </div>
    {list.isPending ? <div className="service-category-list-card"><ListSkeleton rows={5} /></div> : items.length === 0 ? <EmptyState title="Nenhuma categoria cadastrada" description="Crie categorias para organizar o catálogo público." action={<button className="primary-button" onClick={() => { setCreating(true); }}>+ Criar categoria</button>} /> : filteredItems.length === 0 ? <EmptyState title="Nenhuma categoria encontrada" description="Ajuste a busca ou o filtro de status." /> : <div className="service-category-list-card">
      <div className="service-category-table-header"><span>Categoria</span><span>Ordem</span><span>Serviços</span><span>Status</span><span /></div>
      {filteredItems.map((item) => <button className="service-category-row" key={item.publicId} type="button" onClick={() => { setSelected(item.publicId); setCreating(false); }}>
        <span className="service-category-name"><i className="service-category-color" style={{ background: item.color }} /><span className="service-category-name-copy"><strong>{item.name}</strong><small>{item.description ?? 'Nenhuma descrição adicionada'}</small></span></span>
        <span className="service-category-order">{item.sortOrder}</span><span className="service-category-services"><span className="service-category-services-pill">{item.serviceCount ?? 0} {item.serviceCount === 1 ? 'serviço' : 'serviços'}</span></span><span className="service-category-status"><StatusBadge active={item.active}>{item.active ? 'Ativa' : 'Inativa'}</StatusBadge></span><span className="service-category-action-cell"><span className="service-category-action" aria-hidden="true">›</span></span>
      </button>)}
    </div>}
    {creating && <div className="service-category-drawer app-drawer"><div className="service-category-drawer-header"><div><h3>Nova categoria</h3><p>Crie uma categoria para organizar seu catálogo.</p></div><button aria-label="Fechar" className="secondary-button" onClick={closeDrawer}>×</button></div><ServiceCategoryForm busy={mutation.isPending} error={mutation.error instanceof Error ? 'Não foi possível salvar a categoria.' : null} onCancel={closeDrawer} onSave={save} submitLabel="Salvar categoria" /></div>}
    {detail.data && <div className="service-category-drawer app-drawer"><div className="service-category-drawer-header"><div><h3>Editar categoria</h3><p>Atualize os dados e a visibilidade no catálogo.</p></div><button aria-label="Fechar" className="secondary-button" onClick={closeDrawer}>×</button></div><ServiceCategoryForm category={detail.data} busy={mutation.isPending} error={mutation.error instanceof Error ? 'Não foi possível salvar a categoria.' : null} onCancel={closeDrawer} onSave={save} submitLabel="Salvar alterações" /><div className="service-category-status-actions"><div><strong>Estado da categoria</strong><p>{detail.data.active ? 'Esta categoria aparece no catálogo público.' : 'Esta categoria está oculta do catálogo público.'}</p></div><button className="secondary-button" disabled={mutation.isPending} onClick={() => { void mutation.mutateAsync({ url: `/tenant/service-categories/${detail.data.publicId}/${detail.data.active ? 'deactivate' : 'activate'}`, method: 'POST', schema: ServiceCategoryStatusResponseSchema }); }}>{detail.data.active ? 'Desativar' : 'Ativar'}</button></div><div className="service-category-danger-zone"><div><strong>Zona de perigo</strong><p>{detail.data.serviceCount === 0 ? 'Excluir categoria' : `Esta categoria possui ${detail.data.serviceCount} ${detail.data.serviceCount === 1 ? 'serviço' : 'serviços'}. Ao excluí-la, ${detail.data.serviceCount === 1 ? 'esse serviço continuará cadastrado' : 'esses serviços continuarão cadastrados'} e ficarão sem categoria.`}</p></div><button className="danger-outline-button" disabled={deleteMutation.isPending} onClick={() => { requestDelete(detail.data.publicId, detail.data.serviceCount ?? 0); }}>{deleteMutation.isPending ? 'Excluindo…' : 'Excluir categoria'}</button></div></div>}
    {deleteConfirmation && <ConfirmationDialog request={deleteConfirmation} onClose={() => { if (!deleteMutation.isPending) setDeleteConfirmation(null); }} />}
  </section>;
}
