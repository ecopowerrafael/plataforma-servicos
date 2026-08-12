import {
  ProfessionalListResponseSchema,
  ProfessionalServicePublicSchema,
  ProfessionalServicesResponseSchema,
  ProfessionalServiceStatusResponseSchema,
  ServiceListResponseSchema,
  UpsertProfessionalServiceRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';

const money = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [pause, setPause] = useState('');
  const [commissionType, setCommissionType] = useState<'' | 'PERCENTAGE' | 'FIXED'>('');
  const [commissionValue, setCommissionValue] = useState('');
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
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    enabled: isProfessional,
    retry: false,
  });
  const professionals = useQuery({
    queryKey: ['professionals', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: !isProfessional,
    retry: false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['links', url] });
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTarget('');
    setSearch('');
    setPrice('');
    setDuration('');
    setPause('');
    setCommissionType('');
    setCommissionValue('');
  };
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/tenant/professionals/${isProfessional ? professionalPublicId : target}/services`,
        {
          method: 'PUT',
          body: UpsertProfessionalServiceRequestSchema.parse({
            servicePublicId: isProfessional ? target : servicePublicId,
            priceCents: price === '' ? null : Number(price),
            durationMinutes: duration === '' ? null : Number(duration),
            hasPostServiceBreak: pause === '' ? null : Number(pause) > 0,
            postServiceBreakMinutes: pause === '' ? null : Number(pause),
            commissionType: commissionType === '' ? null : commissionType,
            commissionValue: commissionValue === '' ? null : Number(commissionValue),
            active: true,
          }),
          schema: ProfessionalServicePublicSchema,
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      await refresh();
      closeDrawer();
    },
  });
  const status = useMutation({
    mutationFn: (item: { serviceId: string; active: boolean }) =>
      httpClient.request(
        `/tenant/professionals/${isProfessional ? professionalPublicId : target}/services/${item.serviceId}/${item.active ? 'activate' : 'deactivate'}`,
        { method: 'POST', schema: ProfessionalServiceStatusResponseSchema, tenantPublicId },
      ),
    onSuccess: refresh,
  });
  const available = useMemo(
    () =>
      (services.data?.items ?? []).filter((service) =>
        service.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
      ),
    [search, services.data?.items],
  );
  if (links.isPending || (isProfessional && services.isPending))
    return (
      <div className="profile-skeleton">
        <span />
        <span />
        <span />
      </div>
    );
  if (links.error instanceof Error || services.error instanceof Error)
    return (
      <div className="profile-inline-error">
        <strong>Não foi possível carregar os serviços.</strong>
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
  if (!isProfessional)
    return (
      <section className="profile-section">
        <header>
          <div>
            <h3>Profissionais vinculados</h3>
            <p>Os mesmos vínculos usados no perfil de cada profissional.</p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            + Vincular profissional
          </button>
        </header>
        <div className="service-assignment-list">
          {links.data?.items.map((link) => {
            const professional = professionals.data?.items.find(
              (item) => item.publicId === link.professionalPublicId,
            );
            return (
              <article className="service-assignment-card" key={link.publicId}>
                <span className="service-assignment-icon">
                  {professional?.publicName.slice(0, 1) ?? 'P'}
                </span>
                <div>
                  <strong>{professional?.publicName ?? 'Profissional'}</strong>
                  <span>
                    {link.priceCents == null ? 'Preço padrão' : money(link.priceCents)} ·{' '}
                    {link.durationMinutes == null
                      ? 'Duração padrão'
                      : `${String(link.durationMinutes)} min`}
                  </span>
                </div>
                <span className={`profile-status ${link.active ? 'active' : 'inactive'}`}>
                  {link.active ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setTarget(link.professionalPublicId);
                    setPrice(link.priceCents == null ? '' : String(link.priceCents));
                    setDuration(link.durationMinutes == null ? '' : String(link.durationMinutes));
                    setDrawerOpen(true);
                  }}
                >
                  Editar
                </button>
              </article>
            );
          })}
        </div>
        {drawerOpen && (
          <div className="profile-drawer-backdrop" role="presentation" onMouseDown={closeDrawer}>
            <aside
              className="profile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Vincular profissional"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <p className="eyebrow">Profissionais</p>
                  <h3>{target === '' ? 'Vincular profissional' : 'Editar vínculo'}</h3>
                </div>
                <button className="icon-button" type="button" aria-label="Fechar" onClick={closeDrawer}>×</button>
              </header>
              <label>
                Pesquisar profissional
                <input type="search" value={search} placeholder="Digite o nome" onChange={(event) => setSearch(event.target.value)} />
              </label>
              <div className="service-picker">
                {(professionals.data?.items ?? [])
                  .filter((professional) => professional.publicName.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
                  .map((professional) => (
                    <button className={target === professional.publicId ? 'selected' : ''} type="button" key={professional.publicId} onClick={() => setTarget(professional.publicId)}>
                      <strong>{professional.publicName}</strong>
                      <span>Profissional ativo</span>
                    </button>
                  ))}
              </div>
              {target !== '' && (
                <div className="service-override-grid">
                  <label>Preço personalizado (centavos)<input min="0" type="number" value={price} placeholder="Usar padrão" onChange={(event) => setPrice(event.target.value)} /></label>
                  <label>Duração personalizada<input min="1" type="number" value={duration} placeholder="Usar padrão" onChange={(event) => setDuration(event.target.value)} /></label>
                  <label>Pausa após serviço<input min="0" type="number" value={pause} placeholder="Usar padrão" onChange={(event) => setPause(event.target.value)} /></label>
                </div>
              )}
              {save.error instanceof Error && <p className="form-error">Não foi possível salvar o vínculo.</p>}
              <footer>
                <button className="secondary-button" type="button" onClick={closeDrawer}>Cancelar</button>
                <button className="primary-button" disabled={target === '' || save.isPending} type="button" onClick={() => { void save.mutateAsync(); }}>{save.isPending ? 'Salvando…' : 'Confirmar vínculo'}</button>
              </footer>
            </aside>
          </div>
        )}
      </section>
    );
  return (
    <section className="profile-section service-manager">
      <header>
        <div>
          <p className="eyebrow">Catálogo</p>
          <h3>Serviços executados</h3>
          <p>Gerencie vínculos e personalizações específicas deste profissional.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          + Vincular serviço
        </button>
      </header>
      <div className="service-assignment-list">
        {links.data?.items.map((link) => {
          const service = services.data?.items.find(
            (item) => item.publicId === link.servicePublicId,
          );
          return (
            <article className="service-assignment-card" key={link.publicId}>
              <span
                className="service-assignment-icon"
                style={{ background: service?.color ?? '#e2e8f0' }}
              >
                ✦
              </span>
              <div>
                <strong>{service?.name ?? 'Serviço'}</strong>
                <span>
                  {String(link.durationMinutes ?? service?.durationMinutes ?? '—')} min ·{' '}
                  {money(link.priceCents ?? service?.priceCents ?? 0)}
                </span>
              </div>
              <span className={`profile-status ${link.active ? 'active' : 'inactive'}`}>
                {link.active ? 'Ativo' : 'Inativo'}
              </span>
              <div className="service-assignment-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setTarget(link.servicePublicId);
                    setPrice(link.priceCents === null ? '' : String(link.priceCents));
                    setDuration(link.durationMinutes === null ? '' : String(link.durationMinutes));
                    setPause(
                      link.postServiceBreakMinutes === null
                        ? ''
                        : String(link.postServiceBreakMinutes),
                    );
                    setCommissionType(link.commissionType ?? '');
                    setCommissionValue(
                      link.commissionValue === null ? '' : String(link.commissionValue),
                    );
                    setDrawerOpen(true);
                  }}
                >
                  Editar
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    void status.mutateAsync({
                      serviceId: link.servicePublicId,
                      active: !link.active,
                    });
                  }}
                >
                  {link.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          );
        })}
        {links.data?.items.length === 0 && (
          <div className="profile-empty">
            <strong>Nenhum serviço vinculado.</strong>
            <span>Vincule os serviços que este profissional executa.</span>
          </div>
        )}
      </div>
      {drawerOpen && (
        <div className="profile-drawer-backdrop" role="presentation" onMouseDown={closeDrawer}>
          <aside
            className="profile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Vincular serviço"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Serviços</p>
                <h3>{target === '' ? 'Vincular serviço' : 'Editar vínculo'}</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar"
                onClick={closeDrawer}
              >
                ×
              </button>
            </header>
            <label>
              Pesquisar serviço
              <input
                type="search"
                value={search}
                placeholder="Digite o nome"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </label>
            <div className="service-picker">
              {available.map((service) => (
                  <button
                    className={target === service.publicId ? 'selected' : ''}
                    type="button"
                    key={service.publicId}
                    onClick={() => {
                      setTarget(service.publicId);
                    }}
                  >
                    <strong>{service.name}</strong>
                    <span>
                      {service.durationMinutes} min · {money(service.priceCents)}
                    </span>
                  </button>
                ))}
            </div>
            {target !== '' && (
              <div className="service-override-grid">
                <label>
                  Preço personalizado (centavos)
                  <input
                    min="0"
                    type="number"
                    value={price}
                    placeholder="Usar padrão"
                    onChange={(event) => {
                      setPrice(event.target.value);
                    }}
                  />
                </label>
                <label>
                  Duração personalizada
                  <input
                    min="1"
                    type="number"
                    value={duration}
                    placeholder="Usar padrão"
                    onChange={(event) => {
                      setDuration(event.target.value);
                    }}
                  />
                </label>
                <label>
                  Pausa após serviço
                  <input
                    min="0"
                    type="number"
                    value={pause}
                    placeholder="Usar padrão"
                    onChange={(event) => {
                      setPause(event.target.value);
                    }}
                  />
                </label>
                <label>
                  Comissão
                  <select
                    value={commissionType}
                    onChange={(event) => {
                      setCommissionType(event.target.value as '' | 'PERCENTAGE' | 'FIXED');
                    }}
                  >
                    <option value="">Usar padrão</option>
                    <option value="PERCENTAGE">Percentual</option>
                    <option value="FIXED">Fixa</option>
                  </select>
                </label>
                {commissionType !== '' && (
                  <label>
                    Valor da comissão
                    <input
                      min="0"
                      type="number"
                      value={commissionValue}
                      onChange={(event) => {
                        setCommissionValue(event.target.value);
                      }}
                    />
                  </label>
                )}
              </div>
            )}
            {save.error instanceof Error && (
              <p className="form-error">Não foi possível salvar o vínculo.</p>
            )}
            <footer>
              <button className="secondary-button" type="button" onClick={closeDrawer}>
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={target === '' || save.isPending}
                type="button"
                onClick={() => {
                  void save.mutateAsync();
                }}
              >
                {save.isPending ? 'Salvando…' : 'Confirmar vínculo'}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
