import {
  ProfessionalListResponseSchema,
  ProfessionalServicesResponseSchema,
  ServiceListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { httpClient } from '../../lib/http.js';

const money = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function getLinkedSelectionIds(
  items: ReadonlyArray<{ servicePublicId: string; professionalPublicId: string }>,
  isProfessional: boolean,
) {
  return new Set(items.map((item) => (isProfessional ? item.servicePublicId : item.professionalPublicId)));
}

export function ProfessionalServiceLinks({
  tenantPublicId,
  professionalPublicId,
  servicePublicId,
}: {
  tenantPublicId: string;
  professionalPublicId?: string;
  servicePublicId?: string;
}) {
  const client = useQueryClient();
  const isProfessional = professionalPublicId !== undefined;
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionChangedLocally = useRef(false);
  const [expandedOverride, setExpandedOverride] = useState<string | null>(null);

  const url = isProfessional
    ? `/tenant/professionals/${professionalPublicId}/services`
    : `/tenant/services/${servicePublicId ?? ''}/professionals`;

  const links = useQuery({
    queryKey: ['links', url],
    queryFn: () =>
      httpClient.request(url, { schema: ProfessionalServicesResponseSchema, tenantPublicId }),
    retry: false,
  });

  const services = useQuery({
    queryKey: ['services', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    enabled: isProfessional,
    retry: false,
  });

  const professionals = useQuery({
    queryKey: ['professionals', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: !isProfessional,
    retry: false,
  });

  useEffect(() => {
    if (links.data === undefined || selectionChangedLocally.current) return;
    const linkedIds = getLinkedSelectionIds(links.data.items, isProfessional);
    setSelectedIds(linkedIds);
  }, [links.data, isProfessional]);

  const filteredCatalog = useMemo(() => {
    const normalizedSearch = search.toLocaleLowerCase('pt-BR');
    if (isProfessional) {
      return (services.data?.items ?? []).filter((item) =>
        item.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
      );
    }
    return (professionals.data?.items ?? []).filter((item) =>
      item.publicName.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
    );
  }, [search, services.data?.items, professionals.data?.items, isProfessional]);

  const bulkSave = useMutation({
    mutationFn: () => {
      const desiredServicePublicIds = Array.from(selectedIds);
      const endpoint = isProfessional
        ? `/tenant/professionals/${professionalPublicId}/services/bulk`
        : `/tenant/services/${servicePublicId}/professionals/bulk`;
      return httpClient.request(
        endpoint,
        {
          method: 'PUT',
          body: { desiredServicePublicIds },
          schema: ProfessionalServicesResponseSchema,
          tenantPublicId,
        },
      );
    },
    onSuccess: async () => {
      selectionChangedLocally.current = false;
      await client.invalidateQueries({ queryKey: ['links', url] });
    },
  });

  const toggleSelect = (id: string) => {
    selectionChangedLocally.current = true;
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    selectionChangedLocally.current = true;
    const elegibleIds = new Set(
      filteredCatalog
        .filter((item) => {
          if (!isProfessional) {
            return ('active' in item) && item.active;
          }
          return true;
        })
        .map((item) => item.publicId),
    );
    setSelectedIds(elegibleIds);
  };

  const clearSelection = () => {
    selectionChangedLocally.current = true;
    setSelectedIds(new Set());
  };

  if (links.isPending || (isProfessional && services.isPending))
    return (
      <div className="profile-skeleton">
        <span /> <span /> <span />
      </div>
    );

  if (links.error instanceof Error || services.error instanceof Error)
    return (
      <div className="profile-inline-error">
        <strong>Não foi possível carregar os dados.</strong>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void links.refetch();
            void services.refetch();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );

  if (!isProfessional) {
    return (
      <section className="profile-section">
        <header>
          <div>
            <h3>Profissionais vinculados</h3>
            <p>Escolha quais profissionais podem executar este serviço.</p>
          </div>
        </header>
        <div className="assignment-toolbar">
          <label className="app-search-field">
            Pesquisar profissional
            <input
              type="search"
              value={search}
              placeholder="Buscar profissional..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="assignment-actions">
            <span className="assignment-count">
              {selectedIds.size} de {filteredCatalog.length} selecionados
            </span>
            <button className="text-button" type="button" onClick={selectAll}>
              Selecionar todos
            </button>
            <button className="text-button" type="button" onClick={clearSelection}>
              Limpar seleção
            </button>
          </div>
        </div>
        <div className="service-assignment-list">
          {filteredCatalog.map((professional) => (
            <article className="service-assignment-card" key={professional.publicId}>
              <input
                type="checkbox"
                checked={selectedIds.has(professional.publicId)}
                onChange={() => toggleSelect(professional.publicId)}
                aria-label={`Vincular ${'publicName' in professional ? professional.publicName : professional.name}`}
              />
              <div>
                <strong>{'publicName' in professional ? professional.publicName : professional.name}</strong>
                <span className={`profile-status ${professional.active ? 'active' : 'inactive'}`}>
                  {professional.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </article>
          ))}
        </div>
        {filteredCatalog.length === 0 && (
          <div className="profile-empty">
            <strong>
              {search === '' ? 'Nenhum profissional cadastrado.' : 'Nenhum resultado encontrado.'}
            </strong>
          </div>
        )}
        <footer className="profile-section-footer">
          {bulkSave.error instanceof Error && (
            <p className="form-error">Erro ao salvar. Tente novamente.</p>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={bulkSave.isPending}
            onClick={() => void bulkSave.mutateAsync()}
          >
            {bulkSave.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="profile-section service-manager">
      <header>
        <div>
          <p className="eyebrow">Catálogo</p>
          <h3>Serviços executados</h3>
          <p>Escolha quais serviços este profissional realiza.</p>
        </div>
      </header>
      <div className="assignment-toolbar">
          <label className="app-search-field">
          Pesquisar serviço
          <input
            type="search"
            value={search}
            placeholder="Buscar serviço..."
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="assignment-actions">
          <span className="assignment-count">
            {selectedIds.size} de {filteredCatalog.length} selecionados
          </span>
          <button className="text-button" type="button" onClick={selectAll}>
            Selecionar todos
          </button>
          <button className="text-button" type="button" onClick={clearSelection}>
            Limpar seleção
          </button>
        </div>
      </div>
      <div className="service-assignment-list">
        {filteredCatalog.map((service) => (
          <article className="service-assignment-card" key={service.publicId}>
            <input
              type="checkbox"
              checked={selectedIds.has(service.publicId)}
              onChange={() => toggleSelect(service.publicId)}
              aria-label={`Vincular ${service.name}`}
            />
            <div>
              <strong>{service.name}</strong>
              <span>
                {'durationMinutes' in service ? `${service.durationMinutes} min · ${money(service.priceCents)}` : ''}
              </span>
            </div>
            {selectedIds.has(service.publicId) && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setExpandedOverride(
                    expandedOverride === service.publicId ? null : service.publicId,
                  )
                }
              >
                {expandedOverride === service.publicId ? 'Fechar' : 'Personalizar'}
              </button>
            )}
          </article>
        ))}
      </div>
      {filteredCatalog.length === 0 && (
        <div className="profile-empty">
          <strong>
            {search === '' ? 'Nenhum serviço cadastrado.' : 'Nenhum resultado encontrado.'}
          </strong>
        </div>
      )}
      <footer className="profile-section-footer">
        {bulkSave.error instanceof Error && (
          <p className="form-error">Erro ao salvar. Tente novamente.</p>
        )}
        <button
          className="primary-button"
          type="button"
          disabled={bulkSave.isPending}
          onClick={() => void bulkSave.mutateAsync()}
        >
          {bulkSave.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </footer>
    </section>
  );
}
