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
    <section aria-labelledby="combo-title" className="sessions-panel">
      <p className="eyebrow">Catálogo</p>
      <h2 id="combo-title">Combos</h2>
      {notice !== null && <p className="success-message">{notice}</p>}
      <button
        onClick={() => {
          setCreating((value) => !value);
        }}
        type="button"
      >
        {creating ? 'Fechar criação' : 'Criar combo'}
      </button>
      {creating && (
        <ComboForm
          busy={mutation.isPending}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          services={services.data?.items ?? []}
          onSave={save}
        />
      )}
      <div className="platform-form">
        <label>
          Busca
          <input
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Nome do combo"
            value={search}
          />
        </label>
        <label>
          Status
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
        <p>Carregando combos…</p>
      ) : combos.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar combos.</p>
      ) : combos.data === undefined || combos.data.items.length === 0 ? (
        <p>Nenhum item encontrado.</p>
      ) : (
        <>
          <div className="data-list">
            {combos.data.items.map((combo) => (
              <button
                className="data-row"
                key={combo.publicId}
                onClick={() => {
                  setSelected(combo.publicId);
                  setCreating(false);
                }}
                type="button"
              >
                <TenantServiceImage
                  alt={combo.imageAlt ?? combo.name}
                  kind="combos"
                  servicePublicId={combo.publicId}
                  tenantPublicId={tenantPublicId}
                />
                <span>{combo.name}</span>
                <span>{`${String(combo.items.length)} serviços · ${String(combo.durationMinutes)} min`}</span>
                <span>{combo.active ? 'Ativo' : 'Inativo'}</span>
              </button>
            ))}
          </div>
          <div className="form-actions">
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
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.name}</h3>
          {detail.data.imageUrl !== null && (
            <TenantServiceImage
              alt={detail.data.imageAlt ?? detail.data.name}
              kind="combos"
              servicePublicId={detail.data.publicId}
              tenantPublicId={tenantPublicId}
            />
          )}
          <dl className="platform-details">
            <div>
              <dt>{'Duração calculada'}</dt>
              <dd>{`${String(detail.data.durationMinutes)} minutos`}</dd>
            </div>
            <div>
              <dt>{'Preço'}</dt>
              <dd>{detail.data.priceCents}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{detail.data.active ? 'Ativo' : 'Inativo'}</dd>
            </div>
            <div>
              <dt>{'Serviços (na ordem)'}</dt>
              <dd>
                {detail.data.items
                  .slice()
                  .sort((left, right) => left.sortOrder - right.sortOrder)
                  .map((item) => item.name)
                  .join(' → ')}
              </dd>
            </div>
          </dl>
          <ComboForm
            busy={mutation.isPending}
            combo={detail.data}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            services={services.data?.items ?? []}
            onSave={save}
          />
          <ServiceImageUpload
            busy={mutation.isPending}
            hasImage={detail.data.imageUrl !== null}
            onRemove={requestRemoveImage}
            onUpload={updateImage}
          />
          <section aria-label="Profissionais aptos">
            <h4>Profissionais aptos</h4>
            {eligibleProfessionals.data === undefined ||
            eligibleProfessionals.data.items.length === 0 ? (
              <p>Nenhum profissional habilitado em todos os serviços do combo.</p>
            ) : (
              <ul>
                {eligibleProfessionals.data.items.map((professional) => (
                  <li key={professional.publicId}>{professional.publicName}</li>
                ))}
              </ul>
            )}
          </section>
          <div className="form-actions">
            <button
              disabled={mutation.isPending || detail.data.active}
              onClick={() => {
                requestStatus(true);
              }}
              type="button"
            >
              Ativar
            </button>
            <button
              disabled={mutation.isPending || !detail.data.active}
              onClick={() => {
                requestStatus(false);
              }}
              type="button"
            >
              Desativar
            </button>
          </div>
        </article>
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
