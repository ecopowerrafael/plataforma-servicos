import {
  ComboEligibleProfessionalsResponseSchema,
  ComboListResponseSchema,
  ComboPublicSchema,
  ComboStatusResponseSchema,
  CreateComboRequestSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { ComboForm, type ComboSubmission } from './ComboForm.js';
import { ServiceImageUpload } from './ServiceImageUpload.js';
import { TenantServiceImage } from './TenantServiceImage.js';
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  StatusBadge,
} from '../ui/AppUi.js';
import { IconChevronRight, IconClock, IconSearch, IconStack2 } from '@tabler/icons-react';
import '../../styles/combos.css';

export function ComboModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const combos = useQuery({
    queryKey: ['tenant', tenantPublicId, 'combos', page, search, active],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim() !== '') query.set('search', search.trim());
      if (active !== '') query.set('active', active);
      return httpClient.request(`/tenant/combos?${query.toString()}`, {
        schema: ComboListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'combo', selected],
    queryFn: () =>
      httpClient.request(`/tenant/combos/${selected ?? ''}`, {
        schema: ComboPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const eligibleProfessionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'combo', selected, 'professionals'],
    queryFn: () =>
      httpClient.request(`/tenant/combos/${selected ?? ''}/professionals`, {
        schema: ComboEligibleProfessionalsResponseSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'active-for-combos'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      method = 'POST',
      body,
      schema = ComboPublicSchema,
    }: {
      url: string;
      method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      schema?: z.ZodType;
    }) =>
      httpClient.request(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Operação concluída com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'combos'] }),
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'combo', selected] }),
      ]);
    },
  });
  const save = async (value: ComboSubmission) => {
    const result = await mutation.mutateAsync({
      url: selected === null ? '/tenant/combos' : `/tenant/combos/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateComboRequestSchema.parse(value),
    });
    const parsed = ComboPublicSchema.parse(result);
    setSelected(parsed.publicId);
    setCreating(false);
  };
  const updateImage = async (file: File) => {
    if (selected === null) return;
    const body = new FormData();
    body.set('file', file, file.name);
    await mutation.mutateAsync({ url: `/tenant/combos/${selected}/image`, method: 'PUT', body });
  };
  const removeImage = async () => {
    if (selected === null) return;
    await mutation.mutateAsync({ url: `/tenant/combos/${selected}/image`, method: 'DELETE' });
  };
  const requestRemoveImage = () => {
    setConfirmation({
      title: 'Remover imagem?',
      description: 'A imagem principal será removida deste combo.',
      confirmLabel: 'Remover imagem',
      requiresReason: false,
      variant: 'danger',
      onConfirm: removeImage,
    });
    return Promise.resolve();
  };
  const requestStatus = (enabled: boolean) => {
    if (selected === null) return;
    setConfirmation({
      title: enabled ? 'Ativar combo?' : 'Desativar combo?',
      description: enabled
        ? 'O combo voltará a ficar disponível.'
        : 'O combo deixará de ficar disponível.',
      confirmLabel: enabled ? 'Ativar' : 'Desativar',
      requiresReason: false,
      variant: enabled ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/tenant/combos/${selected}/${enabled ? 'activate' : 'deactivate'}`,
          schema: ComboStatusResponseSchema,
        });
      },
    });
  };
  return (
    <section aria-labelledby="combo-title" className="combo-module combo-page-container">
      <PageHeader
        eyebrow="Catálogo"
        title="Combos"
        description="Crie experiências completas combinando serviços em uma única oferta."
        actions={
          <button className="primary-button" type="button" onClick={() => { setCreating(true); }}>
            + Novo combo
          </button>
        }
      />
      {notice !== null && <p className="success-message">{notice}</p>}
      {creating && (
        <div className="combo-edit-shell mb-20 col-span-12">
          <header className="combo-page-header">
            <div>
              <span>Catálogo / Combos / Novo</span>
              <h1>Novo Combo</h1>
            </div>
          </header>
          <ComboForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            services={services.data?.items ?? []}
            servicesLoading={services.isPending}
            onCancel={() => setCreating(false)}
            onSave={save}
          />
        </div>
      )}
      <div className="combo-catalog-panel">
      <div className="combo-catalog-toolbar">
        <label className="app-search-field combo-search">
          <IconSearch aria-hidden="true" size={18} />
          <input
            type="search"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Buscar combo..."
            value={search}
          />
        </label>
        <label className="combo-status-filter">
          <span className="sr-only">Filtrar por status</span>
          <select
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value);
            }}
            value={active}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
      </div>
      {combos.isPending ? (
        <ListSkeleton rows={5} />
      ) : combos.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar combos.</p>
      ) : combos.data === undefined || combos.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum combo cadastrado"
          description="Combine dois ou mais serviços em uma oferta."
          action={<button onClick={() => { setCreating(true); }}>+ Criar combo</button>}
        />
      ) : (
        <>
      <div className="combo-grid">
            {combos.data.items.map((combo) => (
              <button
                className={`combo-card${selected === combo.publicId ? ' is-selected' : ''}`}
                key={combo.publicId}
                onClick={() => {
                  setSelected(combo.publicId);
                  setCreating(false);
                }}
                type="button"
              >
                <span className="combo-card-image"><TenantServiceImage
                  alt={combo.imageAlt ?? combo.name} kind="combos" servicePublicId={combo.publicId} tenantPublicId={tenantPublicId}
                /></span>
                <span className="combo-card-content">
                  <span className="combo-card-heading"><strong>{combo.name}</strong><StatusBadge active={combo.active}>{combo.active ? 'Ativo' : 'Inativo'}</StatusBadge></span>
                  <span className="combo-card-services">{combo.items.slice(0, 3).map((item) => <span className="combo-service-chip" key={item.servicePublicId}>{item.name}</span>)}{combo.items.length > 3 && <span className="combo-service-chip">+{combo.items.length - 3}</span>}</span>
                  <span className="combo-card-meta"><span><IconStack2 aria-hidden="true" size={14} /> {combo.items.length} serviços</span><span><IconClock aria-hidden="true" size={14} /> {combo.durationMinutes} min</span></span>
                  <span className="combo-card-footer"><strong>{(Number(combo.priceCents) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}</strong><span>Editar combo <IconChevronRight aria-hidden="true" size={16} /></span></span>
                </span>
              </button>
            ))}
          </div>
          <div className="combo-pagination">
            <button
              disabled={page <= 1}
              onClick={() => {
                setPage((value) => value - 1);
              }}
              type="button"
            >
              Anterior
            </button>
            <span>{`Página ${String(combos.data.page.page)} de ${String(combos.data.page.totalPages)}`}</span>
            <button
              disabled={page >= combos.data.page.totalPages}
              onClick={() => {
                setPage((value) => value + 1);
              }}
              type="button"
            >
              Próxima
            </button>
          </div>
        </>
      )}
      </div>
      {selected !== null && detail.isPending && (
        <article className="sessions-panel combo-editor-panel col-span-12 lg:col-span-8" aria-label="Carregando combo">
          <div className="combo-loading-skeleton" />
        </article>
      )}
      {detail.data !== undefined && (
        <div className="combo-edit-shell mb-20 col-span-12">
          <header className="combo-page-header">
            <div>
              <span>Catálogo / Combos / Editar</span>
              <h1>{detail.data.name || 'Editar Combo'}</h1>
            </div>
          </header>
          <ComboForm
            busy={mutation.isPending}
            combo={detail.data}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            services={services.data?.items ?? []}
            servicesLoading={services.isPending}
            professionals={eligibleProfessionals.data?.items ?? []}
            imageSection={<ServiceImageUpload busy={mutation.isPending} hasImage={detail.data.imageUrl !== null} onRemove={requestRemoveImage} onUpload={updateImage} preview={<TenantServiceImage alt={detail.data.imageAlt ?? detail.data.name} kind="combos" servicePublicId={detail.data.publicId} tenantPublicId={tenantPublicId} />} />}
            onCancel={() => setSelected(null)}
            onDeactivate={() => requestStatus(false)}
            onSave={save}
          />
        </div>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
