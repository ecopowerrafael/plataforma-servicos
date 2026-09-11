import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import {
  BusinessUnitOperatingHoursResponseSchema,
  ComboListResponseSchema,
  ComboPublicSchema,
  UpdateComboRequestSchema,
  CreateProfessionalRequestSchema,
  CreateServiceRequestSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
  TenantUnitsResponseSchema,
  TenantMediaAssetSchema,
  TenantIdentityResponseSchema,
  ReplaceBusinessUnitOperatingHoursRequestSchema,
  TenantWhiteLabelResponseSchema,
  BusinessProfileLabels,
  OperatingModelLabels,
  OperatingModelDescriptions,
  BusinessProfileCodeSchema,
  OperatingModelSchema,
  UpdateServiceRequestSchema,
  UpdateProfessionalRequestSchema,
} from '@plataforma/shared';
import { BrandLivePreview } from '../components/branding/BrandLivePreview.js';
import { PublicLayoutPicker } from '../components/branding/PublicLayoutPicker.js';
import { BrandAssetDropzone } from '../components/branding/BrandAssetDropzone.js';
import { BrandColorPicker } from '../components/branding/BrandColorPicker.js';
import { BrandThemePicker } from '../components/branding/BrandThemePicker.js';
import { deriveBrandPalette, themeDefaultPalette, type PublicLayoutCode, type BrandThemeCode } from '../components/branding/brand-studio.js';
import { TenantServiceImage } from '../components/services/TenantServiceImage.js';
import { TenantProfessionalPhoto } from '../components/professionals/TenantProfessionalPhoto.js';
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
  operatingModel: OperatingModelSchema,
  businessProfile: BusinessProfileCodeSchema,
});
const Checklist = z.object({
  items: z.array(z.object({ key: z.string(), complete: z.boolean() })),
});
const Context = z.object({ tenant: z.object({ displayName: z.string(), publicId: z.string() }) });

function formatPriceInReais(priceCents: string): string {
  const cents = Number(priceCents);
  if (!Number.isFinite(cents)) return '0,00';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function priceInputToCents(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? '0' : String(Number(digits));
}

export function GuidedSetupPage() {
  const tenantPublicId = readSelectedTenant() ?? '';
  const navigate = useNavigate();
  const [step, setStep] = useState<GuidedSetupStep | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [profileDraft, setProfileDraft] = useState<z.infer<typeof BusinessProfileCodeSchema> | null>(null);
  const [operatingModelDraft, setOperatingModelDraft] = useState<z.infer<typeof OperatingModelSchema> | null>(null);
  const [themeDraft, setThemeDraft] = useState<BrandThemeCode | null>(null);
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<PublicLayoutCode | null>(null);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [editingProfessional, setEditingProfessional] = useState<string | null>(null);
  const [creatingProfessional, setCreatingProfessional] = useState(false);
  const [newProfessional, setNewProfessional] = useState({ name: '', publicName: '', bio: '' });
  const [professionalDraft, setProfessionalDraft] = useState<Record<string, { name: string; publicName: string; bio: string }>>({});
  const [professionalPhotoPreview, setProfessionalPhotoPreview] = useState<Record<string, string>>({});
  const [editingCombo, setEditingCombo] = useState<string | null>(null);
  const [comboDraft, setComboDraft] = useState<Record<string, { name: string; priceCents: string }>>({});
  const [editingService, setEditingService] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<
    Record<number, { active: boolean; startsAt: string; endsAt: string }>
  >({});
  const [serviceDraft, setServiceDraft] = useState<
    Record<
      string,
      { name: string; durationMinutes: string; priceCents: string; description: string }
    >
  >({});
  const [serviceImagePreview, setServiceImagePreview] = useState<Record<string, string>>({});
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
    mutationFn: (input: { step: string; completed?: boolean; slug?: string; displayName?: string; businessProfile?: z.infer<typeof BusinessProfileCodeSchema>; operatingModel?: z.infer<typeof OperatingModelSchema> }) =>
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
  const professionalMutation = useMutation({
    mutationFn: (input: { id: string; body: unknown }) =>
      httpClient.request(`/tenant/professionals/${input.id}`, {
        method: 'PATCH',
        body: UpdateProfessionalRequestSchema.parse(input.body),
        schema: z.object({ publicId: z.string() }),
        tenantPublicId,
      }),
    onSuccess: async () => {
      setEditingProfessional(null);
      await professionals.refetch();
    },
  });
  const createProfessionalMutation = useMutation({
    mutationFn: (body: unknown) => httpClient.request('/tenant/professionals', {
      method: 'POST',
      body: CreateProfessionalRequestSchema.parse(body),
      schema: z.object({ publicId: z.string() }),
      tenantPublicId,
    }),
    onSuccess: async () => {
      setCreatingProfessional(false);
      setNewProfessional({ name: '', publicName: '', bio: '' });
      await professionals.refetch();
    },
  });
  const professionalPhotoMutation = useMutation({
    mutationFn: (input: { id: string; file: File }) => {
      const body = new FormData();
      body.set('file', input.file, input.file.name);
      return httpClient.request(`/tenant/professionals/${input.id}/photo`, {
        method: 'PUT', body, schema: ProfessionalPublicSchema, tenantPublicId,
      });
    },
    onSuccess: async () => { await professionals.refetch(); },
  });
  const comboMutation = useMutation({
    mutationFn: (input: { id: string; body: unknown }) => httpClient.request(`/tenant/combos/${input.id}`, { method: 'PATCH', body: UpdateComboRequestSchema.parse(input.body), schema: ComboPublicSchema, tenantPublicId }),
    onSuccess: async () => { setEditingCombo(null); await combos.refetch(); },
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
    mutationFn: (input: { kind: 'LOGO' | 'BANNER_DESKTOP' | 'SPLASH' | 'APP_ICON'; file: File }) => {
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
      setPreviewVersion((value) => value + 1);
    },
  });
  const savePublicTheme = useMutation({
    mutationFn: (body: { theme: BrandThemeCode; layout: PublicLayoutCode }) => httpClient.request('/tenant/public-site', { method: 'PATCH', body, schema: z.unknown(), tenantPublicId }),
    onSuccess: async () => { await branding.refetch(); setPreviewVersion((value) => value + 1); },
  });
  const saveBranding = useMutation({
    mutationFn: (body: Record<string, string>) => httpClient.request('/tenant/branding', { method: 'PATCH', body, schema: z.unknown(), tenantPublicId }),
    onSuccess: async () => { await branding.refetch(); setPreviewVersion((value) => value + 1); },
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
  const currentProfile = profileDraft ?? (onboarding.data?.onboardingStep === 'WELCOME' ? '' : onboarding.data?.businessProfile ?? identity.data?.identity.businessProfile ?? 'GENERIC');
  const currentOperatingModel = operatingModelDraft ?? onboarding.data?.operatingModel ?? 'SERVICE_PRICING';
  const profileConfirmed = profileDraft !== null || onboarding.data?.onboardingStep !== 'WELCOME';
  const operatingModelConfirmed = operatingModelDraft !== null || onboarding.data?.onboardingStep !== 'WELCOME';
  const currentTheme: BrandThemeCode = themeDraft ?? branding.data?.site?.theme ?? 'CLASSIC';
  const currentColor = colorDraft ?? branding.data?.branding?.primaryColor ?? '#2563eb';
  const currentLayout: PublicLayoutCode = layoutDraft ?? branding.data?.site?.layout ?? 'CLASSIC';
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
  const businessComplete =
    (context.data?.tenant.displayName.trim().length ?? 0) > 1 &&
    currentSlug.length >= 3 &&
    profileConfirmed &&
    operatingModelConfirmed;
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
                <fieldset><legend>Qual é o seu tipo de negócio?</legend><p>Isso nos ajuda a preparar serviços e configurações iniciais para você.</p><select value={currentProfile} onChange={(event) => setProfileDraft(BusinessProfileCodeSchema.parse(event.target.value))}><option value="" disabled>Escolha o tipo de negócio</option>{Object.entries(BusinessProfileLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></fieldset>
                <fieldset><legend>Como você cobra seus clientes?</legend><div className="guided-choice-cards">{(['SERVICE_PRICING', 'MEMBERSHIP'] as const).map((model) => <button type="button" key={model} className={currentOperatingModel === model ? 'is-selected' : ''} onClick={() => setOperatingModelDraft(model)}><strong>{OperatingModelLabels[model]}</strong><span>{OperatingModelDescriptions[model]}</span></button>)}</div></fieldset>
                <label className="guided-slug-field">
                  Endereço público
                  <span className="guided-slug-input"><span>agendei.site/</span><input value={currentSlug} onChange={(event) => setSlugDraft(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="seu-negocio" /></span>
                  <small className={slugAvailability.data?.available ? 'is-available' : ''}>
                    {currentSlug.length < 3 ? 'Use pelo menos 3 caracteres.' : slugAvailability.isPending ? 'Verificando disponibilidade…' : slugAvailability.data?.available ? '✓ Este endereço está disponível.' : 'Este endereço já está em uso.'}
                  </small>
                </label>
                <button className="primary-button guided-save-slug" disabled={currentDisplayName.trim().length < 2 || currentSlug.length < 3 || slugAvailability.data?.available !== true || slugAvailability.isPending || saveStep.isPending || !profileConfirmed || !operatingModelConfirmed} onClick={() => void saveStep.mutateAsync({ step: 'BUSINESS_TYPE', slug: slugDraft || undefined, displayName: displayNameDraft || undefined, businessProfile: currentProfile, operatingModel: currentOperatingModel })}>
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
                      {serviceImagePreview[item.publicId] !== undefined ? <img className="guided-service-image" src={serviceImagePreview[item.publicId]} alt="" /> : item.imageUrl !== null ? <TenantServiceImage alt="" servicePublicId={item.publicId} tenantPublicId={tenantPublicId} version={item.updatedAt} /> : null}
                      <div>
                        <strong>{item.name}</strong>
                        <span className="guided-service-meta">
                          {item.durationMinutes} min ·{' '}
                          {(Number(item.priceCents) / 100).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        {item.imageUrl === null && <small>Sem imagem</small>}
                        <label className="guided-upload-button">
                          {serviceImageMutation.isPending ? 'Enviando…' : 'Adicionar imagem'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                setServiceImagePreview((value) => ({ ...value, [item.publicId]: URL.createObjectURL(file) }));
                                void serviceImageMutation.mutateAsync({ id: item.publicId, file });
                              }
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
                            Preço (R$)
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label="Preço em reais"
                              value={formatPriceInReais(draft.priceCents)}
                              onChange={(event) =>
                                setServiceDraft((value) => ({
                                  ...value,
                                  [item.publicId]: { ...draft, priceCents: priceInputToCents(event.target.value) },
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
                                  imageAlt: item.imageAlt,
                                  iconKey: item.iconKey,
                                  categoryPublicId: item.categoryPublicId,
                                  hasPostServiceBreak: item.hasPostServiceBreak,
                                  postServiceBreakMinutes: item.postServiceBreakMinutes,
                                  pricingMode: item.pricingMode,
                                  quoteNotice: item.quoteNotice,
                                  color: item.color,
                                  sortOrder: item.sortOrder,
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
                {combos.data?.items.length ? combos.data.items.map((combo) => {
                  const draft = comboDraft[combo.publicId] ?? { name: combo.name, priceCents: String(Number(combo.priceCents)) };
                  return <div key={combo.publicId} className="guided-combo-inline">
                    {editingCombo === combo.publicId ? <><input value={draft.name} onChange={(event) => setComboDraft((value) => ({ ...value, [combo.publicId]: { ...draft, name: event.target.value } }))} /><input inputMode="numeric" value={formatPriceInReais(draft.priceCents)} onChange={(event) => setComboDraft((value) => ({ ...value, [combo.publicId]: { ...draft, priceCents: priceInputToCents(event.target.value) } }))} /><button className="primary-button" disabled={comboMutation.isPending} onClick={() => void comboMutation.mutateAsync({ id: combo.publicId, body: { name: draft.name, description: combo.description, imageAlt: combo.imageAlt, priceCents: Number(draft.priceCents), sortOrder: combo.sortOrder, active: combo.active, items: combo.items.map((item) => ({ servicePublicId: item.servicePublicId, sortOrder: item.sortOrder })) } })}>{comboMutation.isPending ? 'Salvando…' : 'Salvar combo'}</button></> : <><span><strong>{combo.name}</strong> · {formatPriceInReais(String(Number(combo.priceCents)))} · {combo.items.length} serviços</span><button className="secondary-button" onClick={() => { setEditingCombo(combo.publicId); setComboDraft((value) => ({ ...value, [combo.publicId]: draft })); }}>Editar combo</button></>}
                  </div>;
                }) : <button className="secondary-button" onClick={() => void navigate('/app/servicos/combos')}>Criar um combo</button>}
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
                {professionals.data?.items.map((item) => {
                  const draft = professionalDraft[item.publicId] ?? { name: item.name, publicName: item.publicName, bio: item.bio ?? '' };
                  return <article key={item.publicId}>
                    <div className="guided-professional-photo-row">
                      {professionalPhotoPreview[item.publicId] !== undefined ? <img className="guided-professional-photo" src={professionalPhotoPreview[item.publicId]} alt="" /> : item.photoUrl !== null ? <TenantProfessionalPhoto name={item.publicName} professionalPublicId={item.publicId} tenantPublicId={tenantPublicId} version={item.updatedAt} /> : <span className="guided-professional-initials">{item.publicName.slice(0, 1).toUpperCase()}</span>}
                      <label className="guided-upload-button">{professionalPhotoMutation.isPending ? 'Enviando…' : 'Adicionar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) { setProfessionalPhotoPreview((value) => ({ ...value, [item.publicId]: URL.createObjectURL(file) })); void professionalPhotoMutation.mutateAsync({ id: item.publicId, file }); } event.currentTarget.value = ''; }} /></label>
                    </div>
                    {editingProfessional === item.publicId ? <div className="guided-professional-editor">
                      <label>Nome<input value={draft.name} onChange={(event) => setProfessionalDraft((value) => ({ ...value, [item.publicId]: { ...draft, name: event.target.value } }))} /></label>
                      <label>Nome público<input value={draft.publicName} onChange={(event) => setProfessionalDraft((value) => ({ ...value, [item.publicId]: { ...draft, publicName: event.target.value } }))} /></label>
                      <label>Bio<textarea value={draft.bio} onChange={(event) => setProfessionalDraft((value) => ({ ...value, [item.publicId]: { ...draft, bio: event.target.value } }))} /></label>
                      <button className="primary-button" disabled={professionalMutation.isPending} onClick={() => void professionalMutation.mutateAsync({ id: item.publicId, body: { name: draft.name, publicName: draft.publicName, bio: draft.bio || null, phone: item.phone, email: item.email, professionalDocument: item.professionalDocument, specialties: item.specialties, calendarColor: item.calendarColor, sortOrder: item.sortOrder, primaryUnitPublicId: item.primaryUnitPublicId, userPublicId: item.userPublicId, commissionType: item.commissionType, commissionValue: item.commissionValue, customFields: {}, active: item.active } })}>{professionalMutation.isPending ? 'Salvando…' : 'Salvar profissional'}</button>
                    </div> : <><strong>{item.publicName}</strong><span>Perfil profissional preparado</span><div className="guided-service-actions"><button className="text-button" onClick={() => { setEditingProfessional(item.publicId); setProfessionalDraft((value) => ({ ...value, [item.publicId]: draft })); }}>Editar no onboarding</button></div></>}
                  </article>;
                })}
              </div>
              {creatingProfessional ? <div className="guided-setup-card guided-professional-create">
                <strong>Adicionar profissional</strong>
                <label>Nome<input value={newProfessional.name} onChange={(event) => setNewProfessional((value) => ({ ...value, name: event.target.value }))} placeholder="Nome completo" /></label>
                <label>Nome público<input value={newProfessional.publicName} onChange={(event) => setNewProfessional((value) => ({ ...value, publicName: event.target.value }))} placeholder="Como os clientes verão" /></label>
                <label>Bio<textarea value={newProfessional.bio} onChange={(event) => setNewProfessional((value) => ({ ...value, bio: event.target.value }))} placeholder="Opcional" /></label>
                <div className="button-row"><button className="secondary-button" onClick={() => setCreatingProfessional(false)}>Cancelar</button><button className="primary-button" disabled={createProfessionalMutation.isPending || newProfessional.name.trim().length < 2 || newProfessional.publicName.trim().length < 2} onClick={() => void createProfessionalMutation.mutateAsync({ name: newProfessional.name, publicName: newProfessional.publicName, bio: newProfessional.bio || null, phone: null, email: null, professionalDocument: null, specialties: [], calendarColor: '#2563EB', sortOrder: professionalCount, primaryUnitPublicId: headquarters?.publicId ?? null, commissionType: 'PERCENTAGE', commissionValue: 0, customFields: {}, active: true })}>{createProfessionalMutation.isPending ? 'Salvando…' : 'Salvar profissional'}</button></div>
              </div> : <button className="secondary-button" onClick={() => setCreatingProfessional(true)}>+ Adicionar profissional</button>}
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
              <h2>Personalize sua página pública</h2>
              <p>Configure a identidade visual completa do seu negócio sem sair do início guiado.</p>
              <div className="guided-branding-grid">
                <BrandAssetDropzone title="Logo" description="Aparece no cabeçalho da sua página." previewUrl={branding.data?.assets.find((asset) => asset.kind === 'LOGO')?.url ? `${environment.apiUrl}${branding.data.assets.find((asset) => asset.kind === 'LOGO')?.url}` : undefined} busy={mediaMutation.isPending} onUpload={(file) => void mediaMutation.mutateAsync({ kind: 'LOGO', file })} />
                <BrandAssetDropzone title="Banner" description="Imagem de destaque da página." previewUrl={branding.data?.assets.find((asset) => asset.kind === 'BANNER_DESKTOP')?.url ? `${environment.apiUrl}${branding.data.assets.find((asset) => asset.kind === 'BANNER_DESKTOP')?.url}` : undefined} busy={mediaMutation.isPending} onUpload={(file) => void mediaMutation.mutateAsync({ kind: 'BANNER_DESKTOP', file })} />
                <BrandAssetDropzone title="Splash" description="Tela de abertura do aplicativo." previewUrl={branding.data?.assets.find((asset) => asset.kind === 'SPLASH')?.url ? `${environment.apiUrl}${branding.data.assets.find((asset) => asset.kind === 'SPLASH')?.url}` : undefined} busy={mediaMutation.isPending} onUpload={(file) => void mediaMutation.mutateAsync({ kind: 'SPLASH', file })} />
                <BrandAssetDropzone title="Ícone do aplicativo" description="Imagem quadrada para o app." square previewUrl={branding.data?.assets.find((asset) => asset.kind === 'APP_ICON')?.url ? `${environment.apiUrl}${branding.data.assets.find((asset) => asset.kind === 'APP_ICON')?.url}` : undefined} busy={mediaMutation.isPending} onUpload={(file) => void mediaMutation.mutateAsync({ kind: 'APP_ICON', file })} />
              </div>
              <div className="guided-setup-card guided-brand-controls">
                <strong>Tema e cores</strong>
                <p className="guided-branding-label">Modelo de layout</p>
                <PublicLayoutPicker value={currentLayout} onChange={setLayoutDraft} />
                <BrandThemePicker value={currentTheme} onChange={(value) => { setThemeDraft(value); setColorDraft(themeDefaultPalette(value, currentColor).primaryColor); }} />
                <BrandColorPicker value={currentColor} onChange={setColorDraft} />
                <button className="primary-button" disabled={savePublicTheme.isPending || saveBranding.isPending} onClick={() => { void savePublicTheme.mutateAsync({ theme: currentTheme, layout: currentLayout }).then(() => saveBranding.mutate(deriveBrandPalette(currentColor, currentTheme))); }}>{savePublicTheme.isPending || saveBranding.isPending ? 'Salvando…' : 'Salvar identidade visual'}</button>
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
                <p className="is-complete">Tipo de negócio: {currentProfile === '' ? 'Não definido' : BusinessProfileLabels[currentProfile]}</p>
                <p className="is-complete">Modelo de cobrança: {OperatingModelLabels[currentOperatingModel]}</p>
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
              disabled={(current === 'review' && !ready) || (current === 'business' && (!profileConfirmed || !operatingModelConfirmed || saveStep.isPending))}
            onClick={next}
          >
            {current === 'review' ? 'Começar a usar o Agendei' : 'Continuar'}
          </button>
            </footer>
            </div>
          </div>
          <aside className="guided-live-preview">
            <div className="guided-preview-heading"><div><span className="eyebrow">Prévia ao vivo</span><h2>Assim seus clientes verão</h2></div><span className="guided-live-dot">● Ao vivo</span></div>
            <div className="guided-phone-wrap"><BrandLivePreview slug={branding.data?.slug ?? ''} version={previewVersion} mode={previewMode} onModeChange={setPreviewMode} override={{ theme: currentTheme, layout: currentLayout, branding: deriveBrandPalette(currentColor, currentTheme) }} /></div>
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
