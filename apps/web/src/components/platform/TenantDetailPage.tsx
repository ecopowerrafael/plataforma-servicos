import {
  PlanListResponseSchema,
  PlatformTenantDetailResponseSchema,
  PlatformTenantSettingsUpdateResponseSchema,
  PlatformTenantWhatsAppSchema,
  PlatformTenantWhatsAppTestResponseSchema,
  SuccessResponseSchema,
  TenantCustomFieldsResponseSchema,
  TenantExperienceResponseSchema,
  TenantFeaturesResponseSchema,
  TenantMediaAssetSchema,
  TenantMediaKindSchema,
  TenantPublicSiteSchema,
  TenantWhiteLabelResponseSchema,
  UpdateTenantPublicSiteRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { ErrorState, formatDate, formatMoney, PageHeader, StatusBadge } from './PlatformUi.js';
import { SubscriptionBillingPanel } from './SubscriptionBillingPanel.js';
import { TenantEditForm } from './TenantEditForm.js';
import { ServicesManager } from './ServicesManager.js';
import { CategoriesManager } from './CategoriesManager.js';
import { ProfessionalsManager } from './ProfessionalsManager.js';
import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import {
  deriveBrandPalette,
  PALETTE_KEYS,
  resolveSavedPalette,
  themeDefaultPalette,
  type BrandPalette,
  type BrandThemeCode,
  type PublicLayoutCode,
} from '../branding/brand-studio.js';
import { BrandAssetCard } from '../branding/BrandAssetCard.js';
import { BrandColorPalette } from '../branding/BrandColorPalette.js';
import { BrandLivePreview } from '../branding/BrandLivePreview.js';
import { BrandThemePicker } from '../branding/BrandThemePicker.js';
import { PublicLayoutPicker } from '../branding/PublicLayoutPicker.js';

import type { UpdatePlatformTenantRequestSchema } from '@plataforma/shared';

type TabKey =
  | 'overview'
  | 'branding'
  | 'company'
  | 'services'
  | 'serviceCategories'
  | 'professionals'
  | 'subscription'
  | 'units'
  | 'features'
  | 'customFields'
  | 'whatsapp'
  | 'settings'
  | 'history';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'branding', label: 'Identidade visual' },
  { key: 'company', label: 'Empresa' },
  { key: 'services', label: 'Serviços' },
  { key: 'serviceCategories', label: 'Categorias' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'subscription', label: 'Assinatura' },
  { key: 'units', label: 'Unidades' },
  { key: 'features', label: 'Funcionalidades' },
  { key: 'customFields', label: 'Campos personalizados' },
  { key: 'whatsapp', label: 'WhatsApp / W-API' },
  { key: 'settings', label: 'Configurações' },
  { key: 'history', label: 'Histórico' },
];

function formText(values: FormData, name: string): string {
  const value = values.get(name);
  return typeof value === 'string' ? value : '';
}

export function TenantDetailPage({ tenantPublicId }: { tenantPublicId: string }) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const client = useQueryClient();

  const detail = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}`, {
        schema: PlatformTenantDetailResponseSchema,
      }),
    retry: false,
  });
  const features = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'features'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/features`, {
        schema: TenantFeaturesResponseSchema,
      }),
    retry: false,
  });
  const customFields = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'custom-fields'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/custom-fields`, {
        schema: TenantCustomFieldsResponseSchema,
      }),
    retry: false,
  });
  const experience = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'experience'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/experience`, {
        schema: TenantExperienceResponseSchema,
      }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({
      url,
      body,
      method = 'POST',
    }: {
      url: string;
      body?: unknown;
      method?: 'POST' | 'PATCH';
    }) => httpClient.request(url, { method, ...(body === undefined ? {} : { body }), schema: z.looseObject({}) }),
    onSuccess: async () => {
      setNotice('Operação concluída com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform', 'tenants'] }),
        client.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId] }),
      ]);
    },
  });

  const save = async (body: z.infer<typeof UpdatePlatformTenantRequestSchema>) => {
    await mutation.mutateAsync({ url: `/platform/tenants/${tenantPublicId}`, body, method: 'PATCH' });
  };
  const requestAction = (label: string, path: string, description: string, requiresReason = true) => {
    setConfirmation({
      title: `${label}?`,
      description,
      confirmLabel: label,
      requiresReason,
      variant: label === 'Desativar' || label === 'Cancelar assinatura' ? 'danger' : 'default',
      onConfirm: async (reason) => {
        await mutation.mutateAsync({
          url: path,
          body: requiresReason ? { reason, ...(path.endsWith('/deactivate') ? { confirm: true } : {}) } : {},
        });
      },
    });
  };

  if (detail.isPending) {
    return (
      <section className="platform-detail-page tenant-detail-page">
        <i className="platform-skeleton" />
        <i className="platform-skeleton" />
      </section>
    );
  }
  if (detail.error instanceof Error) {
    return (
      <section className="platform-detail-page tenant-detail-page">
        <nav aria-label="Trilha" className="platform-breadcrumb">
          <Link to="/platform/tenants">Estabelecimentos</Link>
        </nav>
        <ErrorState
          message={detail.error.message}
          retry={() => {
            void detail.refetch();
          }}
        />
      </section>
    );
  }
  const data = detail.data;
  if (data === undefined) return null;

  return (
    <section className="platform-detail-page tenant-detail-page">
      <nav aria-label="Trilha" className="platform-breadcrumb">
        <Link to="/platform/tenants">Estabelecimentos</Link>
        <span aria-hidden="true">›</span>
        <span>{data.tenant.displayName}</span>
      </nav>
      <PageHeader
        title={data.tenant.displayName}
        description={`${data.tenant.slug} · ${data.subscription?.plan.name ?? 'Sem plano'} · ${data.subscription?.status ?? 'Sem assinatura'}`}
        action={
          <div className="form-actions">
            <StatusBadge value={data.tenant.status} />
            <button
              disabled={mutation.isPending || data.tenant.status !== 'ACTIVE'}
              onClick={() => {
                requestAction('Suspender', `/platform/tenants/${tenantPublicId}/suspend`, 'O estabelecimento ficará suspenso até ser reativado.');
              }}
              type="button"
            >
              Suspender
            </button>
            <button
              disabled={mutation.isPending || data.tenant.status !== 'SUSPENDED'}
              onClick={() => {
                requestAction('Reativar', `/platform/tenants/${tenantPublicId}/reactivate`, 'O estabelecimento voltará a operar normalmente.');
              }}
              type="button"
            >
              Reativar
            </button>
            <button
              disabled={mutation.isPending || data.tenant.status === 'INACTIVE'}
              onClick={() => {
                requestAction('Desativar', `/platform/tenants/${tenantPublicId}/deactivate`, 'O estabelecimento será desativado.');
              }}
              type="button"
            >
              Desativar
            </button>
          </div>
        }
      />
      {notice !== null && <p className="success-message">{notice}</p>}
      {mutation.error instanceof Error && <p className="form-error">{mutation.error.message}</p>}
      <nav aria-label="Abas do estabelecimento" className="prospecting-tabs">
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.key}
            key={item.key}
            onClick={() => {
              setTab(item.key);
            }}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <OverviewTab data={data} featuresCount={features.data?.features.filter((f) => f.enabled).length} customFieldsCount={customFields.data?.fields.length} experience={experience.data} />
      ) : tab === 'branding' ? (
        <BrandingTab tenantPublicId={tenantPublicId} />
      ) : tab === 'company' ? (
        <section className="platform-panel">
          <TenantEditForm
            busy={mutation.isPending}
            tenant={{
              legalName: data.tenant.legalName,
              displayName: data.tenant.displayName,
              slug: data.tenant.slug,
              timezone: data.tenant.timezone,
              locale: data.tenant.locale,
              currency: data.tenant.currency,
            }}
            onSave={save}
          />
        </section>
      ) : tab === 'services' ? (
        <ServicesManager tenantPublicId={tenantPublicId} />
      ) : tab === 'serviceCategories' ? (
        <CategoriesManager tenantPublicId={tenantPublicId} />
      ) : tab === 'professionals' ? (
        <ProfessionalsManager tenantPublicId={tenantPublicId} />
      ) : tab === 'subscription' ? (
        <SubscriptionTab
          data={data}
          mutation={mutation}
          requestAction={requestAction}
        />
      ) : tab === 'units' ? (
        <UnitsTab units={data.units} />
      ) : tab === 'features' ? (
        <FeaturesTab tenantPublicId={tenantPublicId} features={features} mutation={mutation} setConfirmation={setConfirmation} />
      ) : tab === 'customFields' ? (
        <CustomFieldsTab tenantPublicId={tenantPublicId} customFields={customFields} mutation={mutation} setConfirmation={setConfirmation} />
      ) : tab === 'whatsapp' ? (
        <WhatsAppTab tenantPublicId={tenantPublicId} />
      ) : tab === 'settings' ? (
        <SettingsTab tenantPublicId={tenantPublicId} settings={data.settings} />
      ) : (
        <HistoryTab data={data} />
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

function OverviewTab({
  data,
  featuresCount,
  customFieldsCount,
  experience,
}: {
  data: z.infer<typeof PlatformTenantDetailResponseSchema>;
  featuresCount: number | undefined;
  customFieldsCount: number | undefined;
  experience: z.infer<typeof TenantExperienceResponseSchema> | undefined;
}) {
  const whatsapp = useQuery({
    queryKey: ['platform', 'tenant', data.tenant.publicId, 'whatsapp'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${data.tenant.publicId}/whatsapp`, {
        schema: PlatformTenantWhatsAppSchema,
      }),
    retry: false,
  });
  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="platform-metrics-grid">
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Tenant</span>
          <strong>{data.tenant.status}</strong>
          <small>{data.tenant.timezone} · {data.tenant.locale} · {data.tenant.currency}</small>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Assinatura</span>
          <strong>{data.subscription?.status ?? 'Sem assinatura'}</strong>
          <small>{data.subscription ? `Plano ${data.subscription.plan.name}` : 'Nenhum plano contratado'}</small>
        </article>
        <article className={`ds-stat-card${whatsapp.data?.connectionStatus === 'CONNECTED' ? '' : ' ds-stat-card--warning'}`}>
          <span className="ds-eyebrow">WhatsApp</span>
          <strong>{whatsapp.isPending ? '…' : (whatsapp.data?.connectionStatus ?? 'NOT_CONFIGURED')}</strong>
          <small>{whatsapp.data?.phoneNumber ?? 'Instância não conectada'}</small>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Configuração</span>
          <strong>{`${String(data.settings.defaultAppointmentIntervalMinutes)} min`}</strong>
          <small>{`${data.settings.timeFormat} · ${data.settings.dateFormat}`}</small>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Unidades</span>
          <strong>{data.counts.units}</strong>
          <small>{`${String(data.counts.members)} membros`}</small>
        </article>
      </div>
      <div className="platform-overview-grid">
        <article className="platform-panel">
          <header>
            <h3>Resumo</h3>
          </header>
          <dl className="platform-details">
            <div>
              <dt>Nome comercial</dt>
              <dd>{data.tenant.displayName}</dd>
            </div>
            <div>
              <dt>Razão social</dt>
              <dd>{data.tenant.legalName}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{data.tenant.slug}</dd>
            </div>
            <div>
              <dt>Proprietário</dt>
              <dd>{data.owner?.email ?? 'Sem proprietário cadastrado'}</dd>
            </div>
            <div>
              <dt>Plano</dt>
              <dd>{data.subscription?.plan.name ?? 'Sem assinatura'}</dd>
            </div>
            <div>
              <dt>Status da assinatura</dt>
              <dd>{data.subscription ? <StatusBadge value={data.subscription.status} /> : 'Sem assinatura'}</dd>
            </div>
            <div>
              <dt>Período atual</dt>
              <dd>
                {data.subscription
                  ? `${formatDate(data.subscription.currentPeriodStartsAt)} – ${formatDate(data.subscription.currentPeriodEndsAt)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Trial</dt>
              <dd>{data.subscription?.trialEndsAt ? `Até ${formatDate(data.subscription.trialEndsAt)}` : 'Não está em trial'}</dd>
            </div>
            <div>
              <dt>Unidades / membros</dt>
              <dd>{`${String(data.counts.units)} / ${String(data.counts.members)}`}</dd>
            </div>
            <div>
              <dt>Funcionalidades habilitadas</dt>
              <dd>{featuresCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Campos personalizados</dt>
              <dd>{customFieldsCount ?? '—'}</dd>
            </div>
          </dl>
        </article>
        {experience ? (
          <article className="platform-panel">
            <header>
              <h3>Perfil do negócio</h3>
            </header>
            <p>{`Perfil selecionado: ${experience.profile}`}</p>
            <dl className="platform-details">
              <div>
                <dt>Cor primária</dt>
                <dd>{experience.branding.primaryColor}</dd>
              </div>
              <div>
                <dt>Fonte</dt>
                <dd>{experience.branding.fontFamily}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{experience.terminology.professional.plural}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{experience.terminology.customer.plural}</dd>
              </div>
              <div>
                <dt>Serviço</dt>
                <dd>{experience.terminology.service.plural}</dd>
              </div>
              <div>
                <dt>Agendamento</dt>
                <dd>{experience.terminology.appointment.plural}</dd>
              </div>
            </dl>
          </article>
        ) : null}
      </div>
    </div>
  );
}

const HEX = /^#[0-9A-Fa-f]{6}$/u;

const ASSET_CARDS: {
  kind: z.infer<typeof TenantMediaKindSchema>;
  title: string;
  description: string;
  square?: boolean;
  allowGif?: boolean;
}[] = [
  { kind: 'LOGO', title: 'Logo', description: 'Aparece na página pública e no aplicativo.' },
  {
    kind: 'LOGO_COMPACT',
    title: 'Logo compacta',
    description: 'Versão reduzida, usada em espaços estreitos.',
  },
  {
    kind: 'FAVICON',
    title: 'Favicon',
    description: 'Ícone exibido na aba do navegador.',
    square: true,
  },
  {
    kind: 'APP_ICON',
    title: 'Ícone do aplicativo',
    description: 'Usado quando o cliente instala o app (PWA). Precisa ser quadrado.',
    square: true,
  },
  {
    kind: 'SPLASH',
    title: 'Tela de abertura (splash)',
    description: 'Exibida ao abrir o aplicativo instalado.',
    allowGif: true,
  },
  {
    kind: 'BANNER_DESKTOP',
    title: 'Banner / capa (desktop)',
    description: 'Imagem de destaque da página pública em telas largas.',
  },
  {
    kind: 'BANNER_MOBILE',
    title: 'Banner / capa (celular)',
    description: 'Imagem de destaque da página pública no celular.',
  },
  {
    kind: 'INSTITUTIONAL',
    title: 'Material institucional',
    description: 'Imagem adicional para uso institucional.',
  },
];

interface PublicSiteFields {
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  primaryCallToAction: string;
  footerText: string;
  seoTitle: string;
  seoDescription: string;
  pwaName: string;
  pwaShortName: string;
  pwaDescription: string;
}
const emptySiteFields: PublicSiteFields = {
  heroTitle: '',
  heroSubtitle: '',
  aboutText: '',
  primaryCallToAction: '',
  footerText: '',
  seoTitle: '',
  seoDescription: '',
  pwaName: '',
  pwaShortName: '',
  pwaDescription: '',
};
const nullableText = (value: string) => (value.trim() === '' ? null : value.trim());

function BrandingTab({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const queryKey = ['platform', 'tenant', tenantPublicId, 'white-label'];
  const settings = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/white-label`, {
        schema: TenantWhiteLabelResponseSchema,
      }),
    retry: false,
  });

  const [themeOverride, setThemeOverride] = useState<BrandThemeCode | null>(null);
  const [layoutOverride, setLayoutOverride] = useState<PublicLayoutCode | null>(null);
  const [paletteOverride, setPaletteOverride] = useState<Partial<BrandPalette>>({});
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [siteFieldsOverride, setSiteFieldsOverride] = useState<PublicSiteFields | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const theme = themeOverride ?? settings.data?.site.theme ?? 'CLASSIC';
  const layout = layoutOverride ?? settings.data?.site.layout ?? 'CLASSIC';
  const savedPalette = useMemo<BrandPalette>(
    () => resolveSavedPalette(settings.data?.branding, theme),
    [settings.data?.branding, theme],
  );
  const palette = { ...savedPalette, ...paletteOverride };
  const dirty =
    themeOverride !== null || layoutOverride !== null || Object.keys(paletteOverride).length > 0;
  const paletteValid = PALETTE_KEYS.every((key) => HEX.test(palette[key]));

  const site = settings.data?.site;
  const persistedSiteFields: PublicSiteFields =
    site === undefined
      ? emptySiteFields
      : {
          heroTitle: site.heroTitle ?? '',
          heroSubtitle: site.heroSubtitle ?? '',
          aboutText: site.aboutText ?? '',
          primaryCallToAction: site.primaryCallToAction ?? '',
          footerText: site.footerText ?? '',
          seoTitle: site.seoTitle ?? '',
          seoDescription: site.seoDescription ?? '',
          pwaName: site.pwaName ?? '',
          pwaShortName: site.pwaShortName ?? '',
          pwaDescription: site.pwaDescription ?? '',
        };
  const siteFields = siteFieldsOverride ?? persistedSiteFields;

  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
    setPreviewVersion((version) => version + 1);
  };

  const saveBranding = useMutation({
    mutationFn: async () => {
      await httpClient.request(`/platform/tenants/${tenantPublicId}/branding`, {
        method: 'PATCH',
        body: { ...palette, useProfileDefaults: false },
        schema: TenantExperienceResponseSchema,
      });
      await httpClient.request(`/platform/tenants/${tenantPublicId}/public-site`, {
        method: 'PATCH',
        body: { theme, layout },
        schema: TenantPublicSiteSchema,
      });
    },
    onSuccess: async () => {
      setThemeOverride(null);
      setLayoutOverride(null);
      setPaletteOverride({});
      setNotice('Identidade visual atualizada.');
      await refresh();
    },
  });

  const saveSiteTexts = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/public-site`, {
        method: 'PATCH',
        body: UpdateTenantPublicSiteRequestSchema.parse({
          heroTitle: nullableText(siteFields.heroTitle),
          heroSubtitle: nullableText(siteFields.heroSubtitle),
          aboutText: nullableText(siteFields.aboutText),
          primaryCallToAction: nullableText(siteFields.primaryCallToAction),
          footerText: nullableText(siteFields.footerText),
          seoTitle: nullableText(siteFields.seoTitle),
          seoDescription: nullableText(siteFields.seoDescription),
          pwaName: nullableText(siteFields.pwaName),
          pwaShortName: nullableText(siteFields.pwaShortName),
          pwaDescription: nullableText(siteFields.pwaDescription),
        }),
        schema: TenantPublicSiteSchema,
      }),
    onSuccess: async () => {
      setSiteFieldsOverride(null);
      setNotice('Página pública atualizada.');
      await refresh();
    },
  });

  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: z.infer<typeof TenantMediaKindSchema>; file: File }) => {
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(`/platform/tenants/${tenantPublicId}/media/${kind}`, {
        method: 'POST',
        body,
        schema: TenantMediaAssetSchema,
      });
    },
    onSuccess: async () => {
      setNotice('Imagem atualizada com sucesso.');
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (assetPublicId: string) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/media/${assetPublicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
      }),
    onSuccess: async () => {
      setNotice('Imagem removida.');
      await refresh();
    },
  });

  const assets = useMemo(
    () => new Map(settings.data?.assets.map((asset) => [asset.kind, asset])),
    [settings.data?.assets],
  );
  const assetUrl = (kind: z.infer<typeof TenantMediaKindSchema>) => {
    const asset = assets.get(kind);
    return asset === undefined ? undefined : `${environment.apiUrl}${asset.url}`;
  };

  if (settings.isPending) return <i className="platform-skeleton" />;
  if (settings.error instanceof Error || settings.data === undefined)
    return (
      <ErrorState
        message={settings.error instanceof Error ? settings.error.message : 'Não foi possível carregar a identidade visual.'}
        retry={() => {
          void settings.refetch();
        }}
      />
    );

  const busy = upload.isPending || remove.isPending;
  const site_ = (
    <BrandLivePreview
      slug={settings.data.slug}
      version={previewVersion}
      mode={previewMode}
      onModeChange={setPreviewMode}
      override={{ theme, layout, branding: palette }}
    />
  );

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {notice !== null ? <p className="success-message">{notice}</p> : null}
      {saveBranding.error instanceof Error ||
      saveSiteTexts.error instanceof Error ||
      upload.error instanceof Error ||
      remove.error instanceof Error ? (
        <p className="form-error">
          {(saveBranding.error instanceof Error && saveBranding.error.message) ||
            (saveSiteTexts.error instanceof Error && saveSiteTexts.error.message) ||
            (upload.error instanceof Error && upload.error.message) ||
            (remove.error instanceof Error && remove.error.message) ||
            'Não foi possível concluir a alteração.'}
        </p>
      ) : null}
      <div className="platform-overview-grid">
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <section className="platform-panel">
            <header>
              <h3>Assets visuais</h3>
            </header>
            <p className="finance-disclaimer">
              Mesmo storage e mesmas validações do painel do estabelecimento (tipo, tamanho e
              dimensão do arquivo).
            </p>
            <div className="brand-asset-grid">
              {ASSET_CARDS.map((card) => (
                <BrandAssetCard
                  key={card.kind}
                  title={card.title}
                  description={card.description}
                  previewUrl={assetUrl(card.kind)}
                  busy={busy}
                  {...(card.square === undefined ? {} : { square: card.square })}
                  {...(card.allowGif === undefined ? {} : { allowGif: card.allowGif })}
                  onUpload={(file) => {
                    upload.mutate({ kind: card.kind, file });
                  }}
                  onRemove={
                    assets.has(card.kind)
                      ? () => {
                          const asset = assets.get(card.kind);
                          if (asset !== undefined) remove.mutate(asset.publicId);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
          <section className="platform-panel">
            <header>
              <h3>Experiência</h3>
            </header>
            <p>Define a estrutura e a navegação da página pública — não altera as cores.</p>
            <PublicLayoutPicker
              value={layout}
              onChange={(value) => {
                setLayoutOverride(value);
              }}
            />
          </section>
          <section className="platform-panel">
            <header>
              <h3>Tema</h3>
            </header>
            <BrandThemePicker
              value={theme}
              onChange={(value) => {
                setThemeOverride(value);
                setPaletteOverride(themeDefaultPalette(value, palette.primaryColor));
              }}
            />
          </section>
          <section className="platform-panel">
            <header>
              <h3>Cores</h3>
            </header>
            <BrandColorPalette
              palette={palette}
              onChange={(key, value) => {
                setPaletteOverride((current) => ({ ...current, [key]: value }));
              }}
              onApplyPreset={(color) => {
                setPaletteOverride(deriveBrandPalette(color, theme));
              }}
              onRestoreTheme={() => {
                setPaletteOverride(themeDefaultPalette(theme, palette.primaryColor));
              }}
            />
          </section>
          {dirty ? (
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setThemeOverride(null);
                  setLayoutOverride(null);
                  setPaletteOverride({});
                }}
              >
                Descartar
              </button>
              <button
                disabled={saveBranding.isPending || !paletteValid}
                onClick={() => {
                  saveBranding.mutate();
                }}
                type="button"
              >
                {saveBranding.isPending ? 'Salvando…' : 'Salvar identidade visual'}
              </button>
            </div>
          ) : null}
        </div>
        <aside>{site_}</aside>
      </div>
      <section className="platform-panel">
        <header>
          <h3>Página pública</h3>
        </header>
        <p className="finance-disclaimer">Textos, apresentação nos buscadores e nome do aplicativo instalado.</p>
        <form
          className="platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveSiteTexts.mutate();
          }}
        >
          {(
            [
              ['heroTitle', 'Título principal', 'input'],
              ['heroSubtitle', 'Mensagem de apresentação', 'textarea'],
              ['primaryCallToAction', 'Texto da chamada principal', 'input'],
              ['aboutText', 'Sobre o estabelecimento', 'textarea'],
              ['footerText', 'Texto do rodapé', 'input'],
              ['seoTitle', 'Título para buscadores', 'input'],
              ['seoDescription', 'Descrição para buscadores', 'textarea'],
              ['pwaName', 'Nome do aplicativo', 'input'],
              ['pwaShortName', 'Nome curto do aplicativo', 'input'],
              ['pwaDescription', 'Descrição do aplicativo', 'textarea'],
            ] as const
          ).map(([name, label, kind]) => (
            <label key={name}>
              {label}
              {kind === 'textarea' ? (
                <textarea
                  value={siteFields[name]}
                  onChange={(event) => {
                    setSiteFieldsOverride((current) => ({
                      ...(current ?? siteFields),
                      [name]: event.target.value,
                    }));
                  }}
                />
              ) : (
                <input
                  value={siteFields[name]}
                  onChange={(event) => {
                    setSiteFieldsOverride((current) => ({
                      ...(current ?? siteFields),
                      [name]: event.target.value,
                    }));
                  }}
                />
              )}
            </label>
          ))}
          <button disabled={saveSiteTexts.isPending} type="submit">
            {saveSiteTexts.isPending ? 'Salvando…' : 'Salvar página pública'}
          </button>
        </form>
      </section>
    </div>
  );
}

function SubscriptionTab({
  data,
  mutation,
  requestAction,
}: {
  data: z.infer<typeof PlatformTenantDetailResponseSchema>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { url: string; body?: unknown; method?: 'POST' | 'PATCH' }>>;
  requestAction: (label: string, path: string, description: string, requiresReason?: boolean) => void;
}) {
  const [plan, setPlan] = useState('');
  const [cycle, setCycle] = useState<'' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'>('');
  const plans = useQuery({
    queryKey: ['platform', 'plans', 'provisioning'],
    queryFn: () => httpClient.request('/platform/plans?status=ACTIVE&limit=100', { schema: PlanListResponseSchema }),
    retry: false,
  });
  const subscription = data.subscription;
  if (subscription === null) {
    return (
      <section className="platform-panel">
        <p className="muted">Este estabelecimento ainda não possui uma assinatura efetiva.</p>
      </section>
    );
  }
  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section className="platform-panel">
        <header>
          <h3>Gestão da assinatura</h3>
        </header>
        <dl className="platform-details">
          <div>
            <dt>Plano atual</dt>
            <dd>{subscription.plan.name}</dd>
          </div>
          <div>
            <dt>Ciclo</dt>
            <dd>{subscription.billingCycle}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><StatusBadge value={subscription.status} /></dd>
          </div>
          <div>
            <dt>Preço</dt>
            <dd>{formatMoney(subscription.priceCents, subscription.currency)}</dd>
          </div>
        </dl>
        <div className="platform-form">
          <label>
            Novo plano
            <select value={plan} onChange={(event) => { setPlan(event.target.value); }}>
              <option value="">Manter plano atual</option>
              {(plans.data?.items ?? []).map((item) => (
                <option key={item.publicId} value={item.publicId}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Periodicidade futura
            <select value={cycle} onChange={(event) => { setCycle(event.target.value as typeof cycle); }}>
              <option value="">Recomendada pelo novo plano</option>
              <option value="MONTHLY">Mensal</option>
              <option value="QUARTERLY">Trimestral</option>
              <option value="SEMIANNUAL">Semestral</option>
              <option value="ANNUAL">Anual</option>
            </select>
          </label>
          <button
            disabled={mutation.isPending || plan === ''}
            onClick={() => {
              void mutation.mutateAsync({
                url: `/platform/subscriptions/${subscription.publicId}/change-plan`,
                body: { planPublicId: plan, ...(cycle === '' ? {} : { billingCycle: cycle }), reason: 'Alteração pelo detalhe do estabelecimento' },
              });
            }}
            type="button"
          >
            Trocar plano
          </button>
        </div>
        <div className="form-actions">
          {(['suspend', 'reactivate', 'cancel'] as const).map((action) => (
            <button
              disabled={mutation.isPending}
              key={action}
              onClick={() => {
                requestAction(
                  action === 'suspend' ? 'Suspender assinatura' : action === 'reactivate' ? 'Reativar assinatura' : 'Cancelar assinatura',
                  `/platform/subscriptions/${subscription.publicId}/${action}`,
                  'A alteração comercial será registrada no histórico.',
                );
              }}
              type="button"
            >
              {action === 'suspend' ? 'Suspender' : action === 'reactivate' ? 'Reativar' : 'Cancelar'}
            </button>
          ))}
        </div>
      </section>
      <SubscriptionBillingPanel subscriptionPublicId={subscription.publicId} />
    </div>
  );
}

function UnitsTab({ units }: { units: z.infer<typeof PlatformTenantDetailResponseSchema>['units'] }) {
  return (
    <section className="platform-panel">
      <header>
        <h3>Unidades</h3>
      </header>
      <p className="finance-disclaimer">
        Ainda não existem endpoints administrativos globais para criar ou editar unidades a partir do
        /platform — esta lista é somente leitura. Edição de unidades continua disponível apenas pelo
        próprio painel do estabelecimento.
      </p>
      {units.length === 0 ? (
        <p>Nenhuma unidade cadastrada.</p>
      ) : (
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Sede</th>
                <th>Cidade</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.publicId}>
                  <td>{unit.name}</td>
                  <td><StatusBadge value={unit.status} /></td>
                  <td>{unit.isHeadquarters ? 'Sim' : 'Não'}</td>
                  <td>{unit.city ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeaturesTab({
  tenantPublicId,
  features,
  mutation,
  setConfirmation,
}: {
  tenantPublicId: string;
  features: ReturnType<typeof useQuery<z.infer<typeof TenantFeaturesResponseSchema>>>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { url: string; body?: unknown; method?: 'POST' | 'PATCH' }>>;
  setConfirmation: (request: ConfirmationRequest) => void;
}) {
  const client = useQueryClient();
  const requestFeatureChange = (code: string, enabled: boolean) => {
    setConfirmation({
      title: enabled ? 'Habilitar funcionalidade?' : 'Desabilitar funcionalidade?',
      description: enabled
        ? 'A configuração será aplicada somente a este estabelecimento.'
        : 'A configuração será desabilitada somente para este estabelecimento.',
      confirmLabel: enabled ? 'Habilitar' : 'Desabilitar',
      requiresReason: false,
      variant: enabled ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/platform/tenants/${tenantPublicId}/features`,
          method: 'PATCH',
          body: { features: [{ code, enabled }] },
        });
        await client.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId, 'features'] });
      },
    });
  };
  return (
    <section className="platform-panel">
      <header>
        <h3>Funcionalidades</h3>
      </header>
      {features.isPending ? (
        <p>Carregando funcionalidades…</p>
      ) : features.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as funcionalidades.</p>
      ) : features.data === undefined ? null : (
        <div className="data-list" aria-label="Funcionalidades do estabelecimento">
          {features.data.features.map((feature) => (
            <div className="data-row" key={feature.code}>
              <span>{feature.code}</span>
              <span>{feature.recommended ? 'Recomendada pelo perfil' : 'Não recomendada'}</span>
              <span>{feature.source === 'OVERRIDE' ? 'Override ativo' : 'Padrão do perfil'}</span>
              <button
                disabled={mutation.isPending}
                onClick={() => {
                  requestFeatureChange(feature.code, !feature.enabled);
                }}
                type="button"
              >
                {feature.enabled ? 'Desabilitar' : 'Habilitar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CustomFieldsTab({
  tenantPublicId,
  customFields,
  mutation,
  setConfirmation,
}: {
  tenantPublicId: string;
  customFields: ReturnType<typeof useQuery<z.infer<typeof TenantCustomFieldsResponseSchema>>>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { url: string; body?: unknown; method?: 'POST' | 'PATCH' }>>;
  setConfirmation: (request: ConfirmationRequest) => void;
}) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId, 'custom-fields'] });
  return (
    <section className="platform-panel">
      <header>
        <h3>Campos personalizados</h3>
      </header>
      <form
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const type = formText(values, 'customFieldType');
          const options = formText(values, 'customFieldOptions')
            .split(',')
            .map((option) => option.trim())
            .filter((option) => option !== '');
          void mutation
            .mutateAsync({
              url: `/platform/tenants/${tenantPublicId}/custom-fields`,
              body: {
                key: formText(values, 'customFieldKey').trim(),
                label: formText(values, 'customFieldLabel').trim(),
                description: formText(values, 'customFieldDescription').trim() || null,
                type,
                scope: formText(values, 'customFieldScope'),
                required: values.get('customFieldRequired') === 'on',
                active: true,
                order: Number(values.get('customFieldOrder') ?? 0),
                ...(type === 'SELECT' || type === 'MULTISELECT' ? { options } : {}),
              },
            })
            .then(async () => {
              event.currentTarget.reset();
              await invalidate();
            });
        }}
      >
        <label>
          Chave
          <input name="customFieldKey" pattern="[a-z][a-z0-9_]{1,62}" required />
        </label>
        <label>
          Rótulo
          <input name="customFieldLabel" required />
        </label>
        <label>
          Escopo
          <select name="customFieldScope">
            <option value="TENANT">Tenant</option>
            <option value="PROFESSIONAL">Profissional</option>
            <option value="CUSTOMER">Cliente</option>
            <option value="APPOINTMENT">Agendamento</option>
          </select>
        </label>
        <label>
          Tipo
          <select name="customFieldType">
            <option value="TEXT">Texto</option>
            <option value="TEXTAREA">Texto longo</option>
            <option value="NUMBER">Número</option>
            <option value="BOOLEAN">Booleano</option>
            <option value="DATE">Data</option>
            <option value="SELECT">Lista</option>
            <option value="MULTISELECT">Múltipla escolha</option>
          </select>
        </label>
        <label>
          Opções (separadas por vírgula)
          <input name="customFieldOptions" />
        </label>
        <label>
          Ordem
          <input name="customFieldOrder" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          <input name="customFieldRequired" type="checkbox" /> Obrigatório
        </label>
        <button disabled={mutation.isPending} type="submit">
          Criar campo
        </button>
      </form>
      {customFields.isPending ? (
        <p>Carregando campos…</p>
      ) : customFields.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os campos.</p>
      ) : customFields.data === undefined ? null : (
        <div className="data-list">
          {customFields.data.fields.map((field) => (
            <div className="data-row" key={field.publicId}>
              <span>{`${field.scope}: ${field.label} (${field.type})`}</span>
              <span>{field.source === 'PROFILE' ? 'Perfil' : 'Override'}</span>
              <span>{field.active ? 'Ativo' : 'Inativo'}</span>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void mutation
                    .mutateAsync({
                      url: `/platform/tenants/${tenantPublicId}/custom-fields/${field.publicId}`,
                      method: 'PATCH',
                      body: {
                        key: field.key,
                        label: formText(values, 'label').trim(),
                        description: field.description,
                        type: field.type,
                        scope: field.scope,
                        required: field.required,
                        active: field.active,
                        order: Number(values.get('order')),
                        ...(field.options === undefined ? {} : { options: field.options }),
                        ...(field.validation === undefined ? {} : { validation: field.validation }),
                      },
                    })
                    .then(invalidate);
                }}
              >
                <input aria-label={`Rótulo de ${field.label}`} defaultValue={field.label} name="label" />
                <input aria-label={`Ordem de ${field.label}`} defaultValue={field.order} min="0" name="order" type="number" />
                <button disabled={mutation.isPending} type="submit">
                  Salvar
                </button>
              </form>
              <button
                disabled={mutation.isPending}
                onClick={() => {
                  setConfirmation({
                    title: field.active ? 'Desativar campo?' : 'Ativar campo?',
                    description: 'A alteração será aplicada somente a este estabelecimento.',
                    confirmLabel: field.active ? 'Desativar' : 'Ativar',
                    requiresReason: false,
                    variant: field.active ? 'danger' : 'default',
                    onConfirm: async () => {
                      await mutation.mutateAsync({
                        url: `/platform/tenants/${tenantPublicId}/custom-fields/${field.publicId}/${field.active ? 'deactivate' : 'activate'}`,
                      });
                      await invalidate();
                    },
                  });
                }}
                type="button"
              >
                {field.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WhatsAppTab({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [testResult, setTestResult] = useState<z.infer<typeof PlatformTenantWhatsAppTestResponseSchema> | null>(null);

  const query = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'whatsapp'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/whatsapp`, { schema: PlatformTenantWhatsAppSchema }),
    retry: false,
  });

  // Sincronizar estados com current quando a query carregar
  useEffect(() => {
    if (query.data) {
      setInstanceId(query.data.instanceId ?? '');
      setPhoneNumber(query.data.phoneNumber ?? '');
      setInstanceName(query.data.instanceName ?? '');
      setIsActive(query.data.active ?? true);
      setToken(''); // token sempre começa vazio (para segurança)
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/whatsapp`, {
        method: 'PATCH',
        body: {
          instanceId: instanceId.trim(),
          ...(token.trim() === '' ? {} : { token: token.trim() }),
          ...(phoneNumber.trim() === '' ? {} : { phoneNumber: phoneNumber.trim() }),
          ...(instanceName.trim() === '' ? {} : { instanceName: instanceName.trim() }),
          isActive,
        },
        schema: PlatformTenantWhatsAppSchema,
      }),
    onSuccess: async (result) => {
      setToken('');
      client.setQueryData(['platform', 'tenant', tenantPublicId, 'whatsapp'], result);
    },
  });
  const test = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/whatsapp/test`, {
        method: 'POST',
        schema: PlatformTenantWhatsAppTestResponseSchema,
      }),
    onSuccess: async (result) => {
      setTestResult(result);
      await client.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId, 'whatsapp'] });
    },
  });

  if (query.isPending) return <i className="platform-skeleton" />;
  if (query.error instanceof Error) return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const current = query.data;
  if (current === undefined) return null;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section className="platform-panel">
        <header>
          <h3>Instância WhatsApp / W-API deste estabelecimento</h3>
        </header>
        <p className="finance-disclaimer">
          Configuração da instância própria do tenant — não é a chave mestra global da plataforma
          (essa fica em Configurações › WhatsApp / W-API).
        </p>
        <dl className="platform-details">
          <div>
            <dt>Configurada</dt>
            <dd>{current.configured ? 'Sim' : 'Não'}</dd>
          </div>
          <div>
            <dt>Ativa</dt>
            <dd>{current.active ? 'Sim' : 'Não'}</dd>
          </div>
          <div>
            <dt>Status de conexão</dt>
            <dd>{current.connectionStatus ?? 'NOT_CONFIGURED'}</dd>
          </div>
          <div>
            <dt>Instance ID</dt>
            <dd>{current.instanceId ?? '—'}</dd>
          </div>
          <div>
            <dt>Nome da instância</dt>
            <dd>{current.instanceName ?? '—'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{current.phoneNumber ?? '—'}</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>{current.tokenConfigured ? '•••••••• (configurado)' : 'Não configurado'}</dd>
          </div>
          <div>
            <dt>Última verificação</dt>
            <dd>{current.lastCheckedAt ? formatDate(current.lastCheckedAt, true) : '—'}</dd>
          </div>
        </dl>
        {!current.available ? (
          <p className="form-error">O plano atual deste estabelecimento não inclui WhatsApp.</p>
        ) : null}
      </section>
      <section className="platform-panel">
        <header>
          <h3>Editar configuração</h3>
        </header>
        <form
          className="platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save.mutateAsync();
          }}
        >
          <label>
            Instance ID
            <input
              defaultValue={current.instanceId ?? ''}
              onChange={(event) => { setInstanceId(event.target.value); }}
              placeholder={current.instanceId ?? 'ID da instância'}
              required
            />
          </label>
          <label>
            Token (deixe em branco para manter o atual)
            <input
              onChange={(event) => { setToken(event.target.value); }}
              placeholder={current.tokenConfigured ? '•••••••• (mantém o atual)' : 'Token de acesso'}
              type="password"
              value={token}
            />
          </label>
          <label>
            Telefone
            <input
              defaultValue={current.phoneNumber ?? ''}
              onChange={(event) => { setPhoneNumber(event.target.value); }}
            />
          </label>
          <label>
            Nome da instância
            <input
              defaultValue={current.instanceName ?? ''}
              onChange={(event) => { setInstanceName(event.target.value); }}
            />
          </label>
          <label>
            <input checked={isActive} onChange={(event) => { setIsActive(event.target.checked); }} type="checkbox" />
            Ativa
          </label>
          {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
          <button disabled={save.isPending || !instanceId.trim()} type="submit">
            Salvar
          </button>
        </form>
      </section>
      <section className="platform-panel">
        <header>
          <h3>Testar conexão</h3>
        </header>
        <button
          disabled={test.isPending || !current.configured}
          onClick={() => {
            void test.mutateAsync();
          }}
          type="button"
        >
          {test.isPending ? 'Testando…' : 'Testar conexão'}
        </button>
        {test.error instanceof Error ? <p className="form-error">{test.error.message}</p> : null}
        {testResult ? (
          <dl className="platform-details">
            <div>
              <dt>Resultado</dt>
              <dd>{testResult.connected ? 'Conectado' : 'Desconectado'}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{testResult.connectedPhone ?? '—'}</dd>
            </div>
            <div>
              <dt>Nome da instância</dt>
              <dd>{testResult.connectedName ?? '—'}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}

function SettingsTab({
  tenantPublicId,
  settings,
}: {
  tenantPublicId: string;
  settings: z.infer<typeof PlatformTenantDetailResponseSchema>['settings'];
}) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    allowMultipleUnits: settings.allowMultipleUnits,
    defaultAppointmentIntervalMinutes: settings.defaultAppointmentIntervalMinutes,
    weekStartsOn: settings.weekStartsOn,
    timeFormat: settings.timeFormat,
  });
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/settings`, {
        method: 'PATCH',
        body: {
          allowMultipleUnits: form.allowMultipleUnits,
          defaultAppointmentIntervalMinutes: form.defaultAppointmentIntervalMinutes,
          minimumAdvanceMinutes: 0,
          maximumAdvanceDays: 180,
          weekStartsOn: form.weekStartsOn,
          dateFormat: 'DD/MM/YYYY',
          timeFormat: form.timeFormat === '24H' ? '24H' : '12H',
        },
        schema: PlatformTenantSettingsUpdateResponseSchema,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId] });
    },
  });
  return (
    <section className="platform-panel">
      <header>
        <h3>Configurações administrativas</h3>
      </header>
      <p className="finance-disclaimer">
        Somente os campos já suportados pelo tenant são exibidos aqui (moeda, timezone e locale ficam
        na aba Empresa).
      </p>
      <form
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save.mutateAsync();
        }}
      >
        <label>
          <input
            checked={form.allowMultipleUnits}
            onChange={(event) => { setForm((prev) => ({ ...prev, allowMultipleUnits: event.target.checked })); }}
            type="checkbox"
          />
          Permitir múltiplas unidades
        </label>
        <label>
          Intervalo padrão de agendamento (minutos)
          <select
            onChange={(event) => { setForm((prev) => ({ ...prev, defaultAppointmentIntervalMinutes: Number(event.target.value) })); }}
            value={form.defaultAppointmentIntervalMinutes}
          >
            {[5, 10, 15, 20, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes}</option>
            ))}
          </select>
        </label>
        <label>
          Início da semana
          <select
            onChange={(event) => { setForm((prev) => ({ ...prev, weekStartsOn: event.target.value as 'SUNDAY' | 'MONDAY' })); }}
            value={form.weekStartsOn}
          >
            <option value="MONDAY">Segunda-feira</option>
            <option value="SUNDAY">Domingo</option>
          </select>
        </label>
        <label>
          Formato de horário
          <select
            onChange={(event) => { setForm((prev) => ({ ...prev, timeFormat: event.target.value as '24H' | '12H' })); }}
            value={form.timeFormat}
          >
            <option value="24H">24 horas</option>
            <option value="12H">12 horas</option>
          </select>
        </label>
        {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
        {save.isSuccess ? <p className="success-message">Configurações salvas.</p> : null}
        <button disabled={save.isPending} type="submit">
          Salvar configurações
        </button>
      </form>
    </section>
  );
}

function HistoryTab({ data }: { data: z.infer<typeof PlatformTenantDetailResponseSchema> }) {
  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section className="platform-panel">
        <header>
          <h3>Histórico comercial</h3>
        </header>
        {data.subscriptionHistory.length === 0 ? (
          <p>Nenhum evento comercial disponível.</p>
        ) : (
          <ul>
            {data.subscriptionHistory.map((event) => (
              <li key={event.publicId}>{`${event.action} — ${formatDate(event.createdAt, true)}${event.performedBy ? ` · ${event.performedBy.email}` : ''}`}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="platform-panel">
        <header>
          <h3>Auditoria administrativa</h3>
        </header>
        {data.audit.length === 0 ? (
          <p>Nenhum evento de auditoria disponível.</p>
        ) : (
          <ul>
            {data.audit.map((event) => (
              <li key={event.publicId}>{`${event.action} — ${formatDate(event.createdAt, true)}`}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
