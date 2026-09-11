import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import {
  BusinessUnitOperatingHoursResponseSchema,
  ComboListResponseSchema,
  CreateServiceRequestSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
  ProfessionalListResponseSchema,
  TenantUnitsResponseSchema,
  TenantMediaAssetSchema,
  TenantIdentityResponseSchema,
  ReplaceBusinessUnitOperatingHoursRequestSchema,
  TenantWhiteLabelResponseSchema,
  UpdateServiceRequestSchema,
} from '@plataforma/shared';
import { BrandPreview } from '../components/branding/BrandPreview.js';
import { httpClient } from '../lib/http.js';
import { environment } from '../config/environment.js';
import { readSelectedTenant } from '../lib/tenant-selection.js';
import {
  GUIDED_SETUP_STEPS,
  guidedStepForLegacy,
  isGuidedSetupReady,
  legacyStepForGuided,
  type GuidedSetupStep,
} from './guided-setup-steps.js';

const Onboarding = z.object({
  onboardingStep: z.string(),
  onboardingCompletedAt: z.string().nullable(),
  operatingModel: z.string(),
});
const Checklist = z.object({
  items: z.array(z.object({ key: z.string(), complete: z.boolean() })),
});
const Context = z.object({ tenant: z.object({ displayName: z.string(), publicId: z.string() }) });

export function GuidedSetupPage() {
  const tenantPublicId = readSelectedTenant() ?? '';
  const navigate = useNavigate();
  const [step, setStep] = useState<GuidedSetupStep | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [editingService, setEditingService] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<
    Record<number, { active: boolean; startsAt: string; endsAt: string }>
  >({});
  const [serviceDraft, setServiceDraft] = useState<
    Record<
      string,
      { name: string; durationMinutes: string; priceCents: string; description: string }
    >
  >({});
  const onboarding = useQuery({
    queryKey: ['guided-setup', tenantPublicId],
    queryFn: () => httpClient.request('/tenant/onboarding', { schema: Onboarding, tenantPublicId }),
    enabled: tenantPublicId !== undefined,
  });
  const checklist = useQuery({
    queryKey: ['guided-checklist', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/onboarding/checklist', { schema: Checklist, tenantPublicId }),
    enabled: tenantPublicId !== undefined,
  });
  const context = useQuery({
    queryKey: ['tenant-context', tenantPublicId],
    queryFn: () => httpClient.request('/tenant/context', { schema: Context, tenantPublicId }),
    enabled: tenantPublicId !== undefined,
  });
  const identity = useQuery({
    queryKey: ['guided-identity', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/identity', {
        schema: TenantIdentityResponseSchema,
        tenantPublicId,
      }),
    enabled: tenantPublicId !== '',
  });
  const slugAvailability = useQuery({
    queryKey: ['guided-slug-availability', tenantPublicId, slugDraft || identity.data?.identity.slug || ''],
    queryFn: () =>
      httpClient.request(`/tenant/onboarding/slug-availability?slug=${encodeURIComponent(slugDraft || identity.data?.identity.slug || '')}`, {
        schema: z.object({ available: z.boolean() }),
        tenantPublicId,
      }),
    enabled: tenantPublicId !== '' && (slugDraft || identity.data?.identity.slug || '').length >= 3,
  });
  const services = useQuery({
    queryKey: ['guided-services', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    enabled: tenantPublicId !== undefined,
  });
  const professionals = useQuery({
    queryKey: ['guided-professionals', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: tenantPublicId !== undefined,
  });
  const combos = useQuery({
    queryKey: ['guided-combos', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/combos?limit=100&active=true', {
        schema: ComboListResponseSchema,
        tenantPublicId,
      }),
    enabled: tenantPublicId !== undefined,
  });
  const branding = useQuery({
    queryKey: ['guided-branding', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/white-label', {
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId,
      }),
    enabled: tenantPublicId !== undefined,
  });
  const units = useQuery({
    queryKey: ['guided-units', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
    enabled: tenantPublicId !== undefined,
  });
  const headquarters =
    units.data?.units.find((unit) => unit.isHeadquarters) ?? units.data?.units[0];
  const operatingHours = useQuery({
    queryKey: ['guided-hours', tenantPublicId, headquarters?.publicId],
    queryFn: () =>
      httpClient.request(`/tenant/units/${headquarters?.publicId}/operating-hours`, {
        schema: BusinessUnitOperatingHoursResponseSchema,
        tenantPublicId,
      }),
    enabled: headquarters?.publicId !== undefined,
  });
  const saveStep = useMutation({
    mutationFn: (input: { step: string; completed?: boolean; slug?: string; displayName?: string }) =>
      httpClient.request('/tenant/onboarding', {
        method: 'PATCH',
        body: input,
        schema: Onboarding,
        tenantPublicId,
      }),
  });
  const serviceMutation = useMutation({
    mutationFn: (input: { id?: string; body: unknown }) =>
      httpClient.request(
        input.id === undefined ? '/tenant/services' : `/tenant/services/${input.id}`,
        {
          method: input.id === undefined ? 'POST' : 'PATCH',
          body:
            input.id === undefined
              ? CreateServiceRequestSchema.parse(input.body)
              : UpdateServiceRequestSchema.parse(input.body),
          schema: ServicePublicSchema,
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      setEditingService(null);
      await services.refetch();
    },
  });
  const serviceStatusMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/tenant/services/${id}/deactivate`, {
        method: 'POST',
        body: {},
        schema: z.object({ success: z.literal(true) }),
        tenantPublicId,
      }),
    onSuccess: async () => {
      await services.refetch();
    },
  });
  const serviceImageMutation = useMutation({
    mutationFn: (input: { id: string; file: File }) => {
      const body = new FormData();
      body.set('file', input.file, input.file.name);
      return httpClient.request(`/tenant/services/${input.id}/image`, {
        method: 'PUT',
        body,
        schema: ServicePublicSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      await services.refetch();
    },
  });
  const mediaMutation = useMutation({
    mutationFn: (input: { kind: 'LOGO' | 'BANNER_DESKTOP'; file: File }) => {
      const body = new FormData();
      body.set('file', input.file, input.file.name);
      return httpClient.request(`/tenant/media/${input.kind}`, {
        method: 'POST',
        body,
        schema: TenantMediaAssetSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      await branding.refetch();
    },
  });
  const scheduleMutation = useMutation({
    mutationFn: (
      periods: Array<{ weekday: number; startsAt: string; endsAt: string; active: boolean }>,
    ) =>
      httpClient.request(`/tenant/units/${headquarters?.publicId}/operating-hours`, {
        method: 'PUT',
        body: ReplaceBusinessUnitOperatingHoursRequestSchema.parse({ periods }),
        schema: BusinessUnitOperatingHoursResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await operatingHours.refetch();
    },
  });
  const current = step ?? guidedStepForLegacy(onboarding.data?.onboardingStep ?? 'WELCOME');
  const currentSlug = slugDraft || identity.data?.identity.slug || branding.data?.slug || '';
  const currentDisplayName = displayNameDraft || context.data?.tenant.displayName || 'Seu negócio';
  const index = GUIDED_SETUP_STEPS.indexOf(current);
  const progress = checklist.data?.items.filter((item) => item.complete).length ?? 0;
  const labels: Record<GuidedSetupStep, string> = {
    business: 'Seu negócio',
    services: 'Serviços',
    team: 'Equipe',
    schedule: 'Horários',
    page: 'Sua página',
    review: 'Revisão',
  };
  const stepDescriptions: Record<GuidedSetupStep, string> = {
    business: 'Perfil e endereço público',
    services: 'O que você oferece',
    team: 'Quem atende',
    schedule: 'Quando você atende',
    page: 'Identidade da sua página',
    review: 'Tudo pronto para começar',
  };
  const next = () => {
    if (index < GUIDED_SETUP_STEPS.length - 1) {
      const nextStep = GUIDED_SETUP_STEPS[index + 1];
      if (nextStep !== undefined) setStep(nextStep);
      void saveStep.mutateAsync({
        step:
          nextStep === 'services'
            ? 'STARTER_CONTENT'
            : nextStep === 'team'
              ? 'BUSINESS_IDENTITY'
              : nextStep === 'schedule'
                ? 'BUSINESS_ADDRESS'
                : nextStep === 'page'
                  ? 'CUSTOMIZE'
                  : 'READY',
      });
    } else {
      void saveStep.mutateAsync({ step: 'READY', completed: true }).then(() => navigate('/app'));
    }
  };
  const previous = () => {
    if (index > 0) {
      const previousStep = GUIDED_SETUP_STEPS[index - 1];
      if (previousStep !== undefined) setStep(previousStep);
    } else void navigate('/app');
  };
  const serviceCount = services.data?.items.length ?? 0;
  const professionalCount = professionals.data?.items.length ?? 0;
  const scheduleComplete = (operatingHours.data?.items.length ?? 0) > 0;
  const businessComplete = (context.data?.tenant.displayName.trim().length ?? 0) > 1;
  const ready = useMemo(
    () =>
      isGuidedSetupReady({
        business: businessComplete,
        services: serviceCount,
        professionals: professionalCount,
        schedule: scheduleComplete,
      }),
    [businessComplete, serviceCount, professionalCount, scheduleComplete],
  );
  const leave = () => {
    void saveStep
      .mutateAsync({ step: legacyStepForGuided(current) })
      .finally(() => navigate('/app'));
  };
  return (
    <main className="guided-setup-page">
      <section className="guided-setup-shell" aria-label="Configuração inicial">
        <header className="guided-setup-header">
          <div className="guided-brand-lockup">
            <img className="guided-brand-logo" src="/brand/logo-agendei.png" alt="Agendei" />
            <div><span className="eyebrow">Agendei</span><h1>Configuração Inicial</h1></div>
          </div>
          <div className="guided-setup-meta">
            <span>Passo {index + 1} de 6</span><b>{Math.round(((index + 1) / 6) * 100)}%</b>
            <span className="guided-setup-progress">
              <i style={{ width: `${((index + 1) / 6) * 100}%` }} />
            </span>
          </div>
          <button className="guided-exit-link" onClick={leave}>
            Continuar no Painel Principal <span>↗</span>
          </button>
        </header>
        <div className="guided-setup-layout">
          <div className="guided-setup-left-column">
            <div className="guided-setup-card guided-steps-card">
              <p className="guided-steps-heading">Seu progresso</p>
              <nav className="guided-step-list" aria-label="Etapas da configuração">
                {GUIDED_SETUP_STEPS.map((item, itemIndex) => (
                  <button key={item} className={`guided-step-item${item === current ? ' is-active' : ''}`} onClick={() => setStep(item)}>
                    <span className="guided-step-icon">{itemIndex < index ? '✓' : itemIndex === index ? String(itemIndex + 1).padStart(2, '0') : '○'}</span>
                    <span><strong>{labels[item]}</strong><small>{stepDescriptions[item]}</small></span>
                    {item === current && <span className="guided-step-current">Atual</span>}
                  </button>
                ))}
              </nav>
            </div>
            <div className="guided-setup-workspace">
            <div className="guided-setup-content">
          <p className="guided-setup-kicker">{labels[current]}</p>
          {current === 'business' && (
            <>
              <h2>Vamos deixar o Agendei com a cara do seu negócio.</h2>
              <p>
                Confira as informações básicas que já preparamos. Você poderá ajustar detalhes
                depois.
              </p>
              <div className="guided-setup-card">
                <label className="guided-profile-field">Nome do negócio<input value={currentDisplayName} onChange={(event) => setDisplayNameDraft(event.target.value)} placeholder="Ex.: Studio Bella" /></label>
                <span>Perfil: {identity.data?.identity.businessProfile ?? 'configurando'}</span>
                <label className="guided-slug-field">
                  Endereço público
                  <span className="guided-slug-input"><span>agendei.site/</span><input value={currentSlug} onChange={(event) => setSlugDraft(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="seu-negocio" /></span>
                  <small className={slugAvailability.data?.available ? 'is-available' : ''}>
                    {currentSlug.length < 3 ? 'Use pelo menos 3 caracteres.' : slugAvailability.isPending ? 'Verificando disponibilidade…' : slugAvailability.data?.available ? '✓ Este endereço está disponível.' : 'Este endereço já está em uso.'}
                  </small>
                </label>
                <button className="primary-button guided-save-slug" disabled={currentDisplayName.trim().length < 2 || currentSlug.length < 3 || slugAvailability.data?.available !== true || slugAvailability.isPending || saveStep.isPending} onClick={() => void saveStep.mutateAsync({ step: legacyStepForGuided(current), slug: slugDraft || undefined, displayName: displayNameDraft || undefined })}>
                  {saveStep.isPending ? 'Salvando…' : 'Salvar perfil'}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void navigate('/app/empresa/dados')}
                >
                  Editar dados do negócio
                </button>
              </div>
            </>
          )}
          {current === 'services' && (
            <>
              <h2>Seus serviços</h2>
              <p>
                Já deixamos alguns serviços preparados para você. Confira preço, duração e imagem.
              </p>
              <div className="guided-setup-summary">
                {serviceCount} serviço(s) ativo(s) encontrado(s)
              </div>
              <div className="guided-template-chips" aria-label="Sugestões rápidas de serviços">
                <span>Adicionar rápido:</span>
                {['Corte', 'Barba', 'Sobrancelha'].map((template) => (
                  <button key={template} type="button" onClick={() => void serviceMutation.mutateAsync({ body: { name: template, durationMinutes: 30, priceCents: 0, description: null, iconKey: 'sparkles', color: '#2563eb', active: true, sortOrder: serviceCount } })}>{template} +</button>
                ))}
              </div>
              {(serviceMutation.error !== null || serviceImageMutation.error !== null) && (
                <p className="form-error">Não foi possível salvar este serviço. Tente novamente.</p>
              )}
              <div className="guided-setup-list">
                {services.data?.items.map((item) => {
                  const draft = serviceDraft[item.publicId] ?? {
                    name: item.name,
                    durationMinutes: String(item.durationMinutes),
                    priceCents: String(Number(item.priceCents)),
                    description: item.description ?? '',
                  };
                  return (
                    <article key={item.publicId} className="guided-service-card">
                      {item.imageUrl !== null && (
                        <img
                          className="guided-service-image"
                          src={`${environment.apiUrl}${item.imageUrl}`}
                          alt=""
                        />
                      )}
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.durationMinutes} min ·{' '}
                          {(Number(item.priceCents) / 100).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        <small>{item.imageUrl === null ? 'Sem foto' : 'Foto adicionada'}</small>
                        <label className="guided-upload-label">
                          {serviceImageMutation.isPending ? 'Enviando…' : 'Adicionar foto'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file)
                                void serviceImageMutation.mutateAsync({ id: item.publicId, file });
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <div className="guided-service-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingService(item.publicId);
                            setServiceDraft((currentDraft) => ({
                              ...currentDraft,
                              [item.publicId]: draft,
                            }));
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            if (window.confirm('Excluir este serviço?'))
                              void serviceStatusMutation.mutateAsync(item.publicId);
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                      {editingService === item.publicId && (
                        <div className="guided-service-editor">
                          <label>
                            Nome
                            <input
                              value={draft.name}
                              onChange={(event) =>
                                setServiceDraft((value) => ({
                                  ...value,
                                  [item.publicId]: { ...draft, name: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Duração
                            <input
                              type="number"
                              min="1"
                              value={draft.durationMinutes}
                              onChange={(event) =>
                                setServiceDraft((value) => ({
                                  ...value,
                                  [item.publicId]: {
                                    ...draft,
                                    durationMinutes: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Preço em centavos
                            <input
                              type="number"
                              min="0"
                              value={draft.priceCents}
                              onChange={(event) =>
                                setServiceDraft((value) => ({
                                  ...value,
                                  [item.publicId]: { ...draft, priceCents: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Descrição
                            <textarea
                              value={draft.description}
                              onChange={(event) =>
                                setServiceDraft((value) => ({
                                  ...value,
                                  [item.publicId]: { ...draft, description: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <button
                            className="primary-button"
                            disabled={serviceMutation.isPending}
                            onClick={() =>
                              void serviceMutation.mutateAsync({
                                id: item.publicId,
                                body: {
                                  name: draft.name,
                                  durationMinutes: Number(draft.durationMinutes),
                                  priceCents: Number(draft.priceCents),
                                  description: draft.description || null,
                                  active: true,
                                },
                              })
                            }
                          >
                            {serviceMutation.isPending ? 'Salvando…' : 'Salvar serviço'}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="guided-setup-card">
                <strong>Você oferece serviços juntos?</strong>
                <span>
                  {combos.data?.items.length
                    ? `${combos.data.items.length} combo(s) já configurado(s).`
                    : 'Se vende dois ou mais serviços em conjunto, você pode criar um combo.'}
                </span>
                <button
                  className="secondary-button"
                  onClick={() => void navigate('/app/servicos/combos')}
                >
                  {combos.data?.items.length ? 'Editar combos' : 'Criar um combo'}
                </button>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  const name = window.prompt('Nome do novo serviço');
                  if (name?.trim())
                    void serviceMutation.mutateAsync({
                      body: {
                        name: name.trim(),
                        durationMinutes: 30,
                        priceCents: 0,
                        description: null,
                        iconKey: 'sparkles',
                        color: '#C79A5B',
                        active: true,
                        sortOrder: serviceCount,
                      },
                    });
                }}
              >
                + Adicionar serviço
              </button>
              <button className="secondary-button" onClick={() => void navigate('/app/servicos')}>
                Abrir catálogo completo
              </button>
            </>
          )}
          {current === 'team' && (
            <>
              <h2>Quem atende seus clientes?</h2>
              <p>Já preparamos seu perfil. Confira quem fará os atendimentos.</p>
              <div className="guided-setup-summary">
                {professionalCount} profissional(is) ativo(s)
              </div>
              {professionalCount <= 1 && (
                <div className="guided-setup-card">
                  <strong>Trabalho sozinho</strong>
                  <span>
                    Seu perfil principal já está preparado. Você pode continuar sem adicionar outra
                    pessoa.
                  </span>
                </div>
              )}
              <div className="guided-setup-list">
                {professionals.data?.items.map((item) => (
                  <article key={item.publicId}>
                    <strong>{item.publicName}</strong>
                    <span>Perfil profissional preparado</span>
                    <div className="guided-service-actions">
                      <button
                        className="text-button"
                        onClick={() => void navigate(`/app/equipe/profissionais/${item.publicId}`)}
                      >
                        Editar
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void navigate(`/app/equipe/profissionais/${item.publicId}?tab=services`)
                        }
                      >
                        Definir serviços
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="secondary-button"
                onClick={() => void navigate('/app/equipe/profissionais')}
              >
                + Adicionar profissional
              </button>
            </>
          )}
          {current === 'schedule' && (
            <>
              <h2>Quando você atende?</h2>
              <p>Preparamos um horário inicial. Está correto?</p>
              <div className="guided-week guided-week-editor">
                {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                  const period = operatingHours.data?.items.find(
                    (item) => item.weekday === weekday && item.active,
                  );
                  const draft = scheduleDraft[weekday] ?? {
                    active: period !== undefined,
                    startsAt: period?.startsAt ?? '09:00',
                    endsAt: period?.endsAt ?? '18:00',
                  };
                  return (
                    <div key={weekday}>
                      <span>{['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][weekday]}</span>
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) =>
                          setScheduleDraft((value) => ({
                            ...value,
                            [weekday]: { ...draft, active: event.target.checked },
                          }))
                        }
                      />
                      <input
                        type="time"
                        value={draft.startsAt}
                        disabled={!draft.active}
                        onChange={(event) =>
                          setScheduleDraft((value) => ({
                            ...value,
                            [weekday]: { ...draft, startsAt: event.target.value },
                          }))
                        }
                      />
                      <span>—</span>
                      <input
                        type="time"
                        value={draft.endsAt}
                        disabled={!draft.active}
                        onChange={(event) =>
                          setScheduleDraft((value) => ({
                            ...value,
                            [weekday]: { ...draft, endsAt: event.target.value },
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => {
                    const monday = scheduleDraft[1] ?? {
                      active: true,
                      startsAt: '09:00',
                      endsAt: '18:00',
                    };
                    setScheduleDraft((value) => ({
                      ...value,
                      1: monday,
                      2: monday,
                      3: monday,
                      4: monday,
                      5: monday,
                    }));
                  }}
                >
                  Aplicar de segunda a sexta
                </button>
                <button
                  className="primary-button"
                  disabled={scheduleMutation.isPending || headquarters === undefined}
                  onClick={() => {
                    const periods = [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) => {
                      const draft = scheduleDraft[weekday] ?? {
                        active: weekday !== 0,
                        startsAt: '09:00',
                        endsAt: weekday === 6 ? '13:00' : '18:00',
                      };
                      return draft.active ? [{ weekday, ...draft }] : [];
                    });
                    void scheduleMutation.mutateAsync(periods);
                  }}
                >
                  {scheduleMutation.isPending ? 'Salvando…' : 'Salvar horários'}
                </button>
              </div>
              {scheduleMutation.error !== null && (
                <p className="form-error">Não foi possível salvar os horários. Tente novamente.</p>
              )}
              <button
                className="secondary-button"
                onClick={() => void navigate('/app/agenda/disponibilidade')}
              >
                Quero ajustar
              </button>
            </>
          )}
          {current === 'page' && (
            <>
              <h2>Veja como sua página já está ficando.</h2>
              <p>Identidade, tema e mídia podem ser refinados agora ou depois.</p>
              <div className="guided-page-grid">
                <div>
                  <div className="guided-setup-card">
                    <strong>{branding.data?.site?.theme ?? 'Tema padrão'}</strong>
                    <span>{branding.data?.assets?.length ?? 0} mídia(s) configurada(s)</span>
                  </div>
                  <div className="guided-setup-card guided-media-actions">
                    <strong>Adicione um destaque à sua página</strong>
                    <span>Você pode usar uma imagem existente ou fazer isso depois.</span>
                    <label className="guided-upload-label">
                      {mediaMutation.isPending ? 'Enviando…' : 'Enviar logo ou banner'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file)
                            void mediaMutation.mutateAsync({ kind: 'BANNER_DESKTOP', file });
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {mediaMutation.error !== null && (
                      <small className="form-error">Não foi possível enviar esta imagem.</small>
                    )}
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => void navigate('/app/empresa/pagina-publica')}
                  >
                    Personalizar página
                  </button>
                  <button
                    className="secondary-button guided-mobile-preview-toggle"
                    onClick={() => setShowPreview((value) => !value)}
                  >
                    {showPreview ? 'Voltar à configuração' : 'Ver prévia'}
                  </button>
                </div>
                <div className={`guided-preview-frame${showPreview ? ' is-mobile-visible' : ''}`}>
                  <BrandPreview
                    displayName={context.data?.tenant.displayName ?? 'Agendei'}
                    theme={branding.data?.site?.theme ?? 'CLASSIC'}
                    color={branding.data?.branding?.primaryColor ?? '#C79A5B'}
                    mode="mobile"
                    tenantSlug={branding.data?.slug}
                  />
                </div>
              </div>
            </>
          )}
          {current === 'review' && (
            <>
              <h2>Seu Agendei está pronto</h2>
              <div className="guided-review">
                <p className={businessComplete ? 'is-complete' : ''}>
                  {businessComplete ? '✓' : '○'} Nome configurado
                </p>
                <p className={serviceCount > 0 ? 'is-complete' : ''}>
                  {serviceCount > 0 ? '✓' : '○'} Pelo menos 1 serviço
                </p>
                <p className={professionalCount > 0 ? 'is-complete' : ''}>
                  {professionalCount > 0 ? '✓' : '○'} Pelo menos 1 profissional
                </p>
                <p className={scheduleComplete ? 'is-complete' : ''}>
                  {scheduleComplete ? '✓' : '○'} Horário configurado
                </p>
                <hr />
                <p>○ Logo, banner e página pública são recomendados</p>
                <p>○ WhatsApp, pagamentos e domínio podem ficar para depois</p>
              </div>
            </>
          )}
            </div>
            <footer className="guided-setup-footer">
          <button className="secondary-button" onClick={previous}>
            Voltar
          </button>
          <button
            className="primary-button"
            disabled={current === 'review' && !ready}
            onClick={next}
          >
            {current === 'review' ? 'Começar a usar o Agendei' : 'Continuar'}
          </button>
            </footer>
            </div>
          </div>
          <aside className="guided-live-preview">
            <div className="guided-preview-heading"><div><span className="eyebrow">Prévia ao vivo</span><h2>Assim seus clientes verão</h2></div><span className="guided-live-dot">● Ao vivo</span></div>
            <div className="guided-phone-wrap"><BrandPreview displayName={currentDisplayName} theme={branding.data?.site?.theme ?? 'CLASSIC'} color={branding.data?.branding?.primaryColor ?? '#2563eb'} logoUrl={branding.data?.assets.find((asset) => asset.kind === 'LOGO')?.url ? `${environment.apiUrl}${branding.data.assets.find((asset) => asset.kind === 'LOGO')?.url}` : undefined} mode="mobile" services={services.data?.items.map((item) => ({ name: item.name, durationMinutes: item.durationMinutes }))} /></div>
            <p className="guided-preview-url">agendei.site/<strong>{branding.data?.slug ?? 'seu-negocio'}</strong></p>
            <small className="guided-preview-hint">As alterações aparecem aqui instantaneamente.</small>
          </aside>
        </div>
        <div className="guided-setup-status" aria-live="polite">
          {saveStep.isPending ||
          serviceMutation.isPending ||
          serviceImageMutation.isPending ||
          scheduleMutation.isPending ||
          mediaMutation.isPending
            ? 'Salvando…'
            : '✓ Salvo'}
        </div>
        <div className="guided-setup-real-progress">{progress} itens concluídos</div>
      </section>
    </main>
  );
}
