import {
  AuthMeResponseSchema,
  AuthSessionsResponseSchema,
  BusinessProfileCatalog,
  SuccessResponseSchema,
  TenantExperienceResponseSchema,
  TenantSubscriptionResponseSchema,
  TenantWhiteLabelResponseSchema,
  type PlanLimitKey,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { persistLayoutAndAdvance } from './onboarding-flow.js';
import { deriveBrandPalette, type BrandThemeCode } from '../components/branding/brand-studio.js';
import { BrandAssetDropzone } from '../components/branding/BrandAssetDropzone.js';
import { BrandColorPicker } from '../components/branding/BrandColorPicker.js';
import { BrandPreview } from '../components/branding/BrandPreview.js';
import { BrandThemePicker } from '../components/branding/BrandThemePicker.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { PageHeader } from '../components/ui/AppUi.js';
import { environment } from '../config/environment.js';
import { HttpError, httpClient } from '../lib/http.js';
import { clearSelectedTenant, readSelectedTenant, selectTenant } from '../lib/tenant-selection.js';

// Dynamic module boundaries keep inactive product areas out of the initial panel bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = <T extends ComponentType<any>, K extends string>(
  module: Promise<Record<K, T>>,
  key: K,
) => lazy(async () => ({ default: (await module)[key] }));
const AppointmentModule = load(
  import('../components/appointments/AppointmentModule.js'),
  'AppointmentModule',
);
const AppointmentWaitlistModule = load(
  import('../components/appointments/AppointmentWaitlistModule.js'),
  'AppointmentWaitlistModule',
);
const CalendarModule = load(import('../components/calendar/CalendarModule.js'), 'CalendarModule');
const CustomerModule = load(import('../components/customers/CustomerModule.js'), 'CustomerModule');
const CustomerProfile = load(
  import('../components/customers/CustomerProfile.js'),
  'CustomerProfile',
);
const MyAgendaModule = load(
  import('../components/professionals/MyAgendaModule.js'),
  'MyAgendaModule',
);
const MyAvailabilityModule = load(
  import('../components/professionals/MyAvailabilityModule.js'),
  'MyAvailabilityModule',
);
const MyCommissionsModule = load(
  import('../components/professionals/MyCommissionsModule.js'),
  'MyCommissionsModule',
);
const ProfessionalModule = load(
  import('../components/professionals/ProfessionalModule.js'),
  'ProfessionalModule',
);
const ComboModule = load(import('../components/services/ComboModule.js'), 'ComboModule');
const ServiceCategoryModule = load(
  import('../components/services/ServiceCategoryModule.js'),
  'ServiceCategoryModule',
);
const ServiceCreatePage = load(
  import('../components/services/ServiceCreatePage.js'),
  'ServiceCreatePage',
);
const ServiceModule = load(import('../components/services/ServiceModule.js'), 'ServiceModule');
const ServiceProfile = load(import('../components/services/ServiceProfile.js'), 'ServiceProfile');
const CashRegisterModule = load(
  import('../components/tenants/CashRegisterModule.js'),
  'CashRegisterModule',
);
const BannersModule = load(import('../components/tenants/BannersModule.js'), 'BannersModule');
const CompanyDataModule = load(
  import('../components/tenants/CompanyDataModule.js'),
  'CompanyDataModule',
);
const CommissionsModule = load(
  import('../components/tenants/CommissionsModule.js'),
  'CommissionsModule',
);
const CouponsModule = load(import('../components/tenants/CouponsModule.js'), 'CouponsModule');
const CustomerRecoveryModule = load(
  import('../components/tenants/CustomerRecoveryModule.js'),
  'CustomerRecoveryModule',
);
const DelinquencyModule = load(
  import('../components/tenants/DelinquencyModule.js'),
  'DelinquencyModule',
);
const FinancialClosingModule = load(
  import('../components/tenants/FinancialClosingModule.js'),
  'FinancialClosingModule',
);
const FinancialReportModule = load(
  import('../components/tenants/FinancialReportModule.js'),
  'FinancialReportModule',
);
const IntegrationsModule = load(
  import('../components/tenants/IntegrationsModule.js'),
  'IntegrationsModule',
);
const LoyaltyModule = load(import('../components/tenants/LoyaltyModule.js'), 'LoyaltyModule');
const MembersModule = load(import('../components/tenants/MembersModule.js'), 'MembersModule');
const MultiUnitOverviewModule = load(
  import('../components/tenants/MultiUnitOverviewModule.js'),
  'MultiUnitOverviewModule',
);
const NotificationLogModule = load(
  import('../components/tenants/NotificationLogModule.js'),
  'NotificationLogModule',
);
const NotificationTemplateModule = load(
  import('../components/tenants/NotificationTemplateModule.js'),
  'NotificationTemplateModule',
);
const OperationsDashboardModule = load(
  import('../components/tenants/OperationsDashboardModule.js'),
  'OperationsDashboardModule',
);
const PaymentMethodsModule = load(
  import('../components/tenants/PaymentMethodsModule.js'),
  'PaymentMethodsModule',
);
const PaymentOptionsModule = load(
  import('../components/tenants/PaymentOptionsModule.js'),
  'PaymentOptionsModule',
);
const ProductCatalog = load(import('../components/products/ProductCatalog.js'), 'ProductCatalog');
const ProductProfile = load(import('../components/products/ProductProfile.js'), 'ProductProfile');
const ProductStockModule = load(
  import('../components/products/ProductStockModule.js'),
  'ProductStockModule',
);
const ProductMovementsModule = load(
  import('../components/products/ProductMovementsModule.js'),
  'ProductMovementsModule',
);
const PublicPageSettingsModule = load(
  import('../components/tenants/PublicPageSettingsModule.js'),
  'PublicPageSettingsModule',
);
const TenantDomainModule = load(
  import('../components/tenants/TenantDomainModule.js'),
  'TenantDomainModule',
);
const TenantSettingsModule = load(
  import('../components/tenants/TenantSettingsModule.js'),
  'TenantSettingsModule',
);
const TenantSubscriptionModule = load(
  import('../components/tenants/TenantSubscriptionModule.js'),
  'TenantSubscriptionModule',
);
const UnitsModule = load(import('../components/tenants/UnitsModule.js'), 'UnitsModule');
const WhiteLabelModule = load(
  import('../components/tenants/WhiteLabelModule.js'),
  'WhiteLabelModule',
);

const OnboardingResponseSchema = z.object({
  onboardingStep: z.string(),
  onboardingCompletedAt: z.string().nullable(),
  onboardingChecklistHiddenAt: z.string().nullable(),
});
const OnboardingChecklistSchema = z.object({
  hidden: z.boolean(),
  items: z.array(z.object({ key: z.string(), complete: z.boolean() })),
});

interface AppMenuItem {
  label: string;
  to: string;
  visible: boolean;
}

interface AppMenuGroup {
  label: string;
  path: string;
  items: AppMenuItem[];
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/(^-|-$)/gu, '')
    .slice(0, 63);
}

const GUIDED_STEPS = [
  'WELCOME',
  'BUSINESS_TYPE',
  'STARTER_CONTENT',
  'BUSINESS_IDENTITY',
  'BUSINESS_ADDRESS',
  'CUSTOMIZE',
  'LAYOUT',
  'COLORS',
  'SPLASH',
  'APP_ICON',
  'READY',
];

function previousOnboardingStep(step: string): string | null {
  return (
    (
      {
        BUSINESS_TYPE: 'WELCOME',
        STARTER_CONTENT: 'BUSINESS_TYPE',
        BUSINESS_IDENTITY: 'STARTER_CONTENT',
        BUSINESS_ADDRESS: 'BUSINESS_IDENTITY',
        CUSTOMIZE: 'BUSINESS_ADDRESS',
        LAYOUT: 'CUSTOMIZE',
        COLORS: 'LAYOUT',
        SPLASH: 'COLORS',
        APP_ICON: 'SPLASH',
        READY: 'APP_ICON',
      } as Record<string, string>
    )[step] ?? null
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const selectedTenant = readSelectedTenant();
  const [profile, setProfile] = useState('GENERIC');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [publicThemeOverride, setPublicTheme] = useState<BrandThemeCode | null>(null);
  const [primaryColorOverride, setPrimaryColor] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // "Sair do início guiado" apenas pausa: o CTA no painel retoma a etapa pendente.
  const [guidedPaused, setGuidedPaused] = useState(
    () => sessionStorage.getItem('agendei:onboarding-paused') === '1',
  );
  const pauseGuided = (paused: boolean) => {
    sessionStorage.setItem('agendei:onboarding-paused', paused ? '1' : '0');
    setGuidedPaused(paused);
  };
  const me = useQuery({
    queryKey: ['auth', 'me', selectedTenant],
    queryFn: () =>
      httpClient.request('/auth/me', {
        schema: AuthMeResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    retry: false,
  });
  const experience = useQuery({
    queryKey: ['tenant', selectedTenant, 'experience'],
    queryFn: () =>
      httpClient.request('/tenant/experience', {
        schema: TenantExperienceResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    enabled: selectedTenant !== undefined,
    retry: false,
  });
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => httpClient.request('/auth/sessions', { schema: AuthSessionsResponseSchema }),
    retry: false,
  });
  const planAccess = useQuery({
    queryKey: ['tenant', selectedTenant, 'subscription-access'],
    queryFn: () =>
      httpClient.request('/tenant/subscription', {
        schema: TenantSubscriptionResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    enabled: selectedTenant !== undefined,
    retry: false,
  });
  const onboarding = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding'],
    queryFn: () =>
      httpClient.request('/tenant/onboarding', {
        schema: OnboardingResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    enabled: selectedTenant !== undefined,
    retry: false,
  });
  const onboardingBrand = useQuery({
    queryKey: ['tenant', selectedTenant, 'white-label'],
    queryFn: () => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/white-label', {
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId: selectedTenant,
      });
    },
    enabled: selectedTenant !== undefined && onboarding.data?.onboardingCompletedAt === null,
    retry: false,
  });
  const publicTheme = publicThemeOverride ?? onboardingBrand.data?.site.theme ?? 'MODERN';
  const primaryColor =
    primaryColorOverride ?? onboardingBrand.data?.branding.primaryColor ?? '#2563EB';
  const onboardingLogo = onboardingBrand.data?.assets.find((asset) => asset.kind === 'LOGO');
  const onboardingLogoUrl =
    onboardingLogo === undefined ? undefined : `${environment.apiUrl}${onboardingLogo.url}`;
  const effectiveBusinessName =
    businessName === '' ? (me.data?.currentTenant?.tenant.displayName ?? '') : businessName;
  const suggestedSlug = slugify(effectiveBusinessName);
  const slugAvailability = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding-slug', suggestedSlug],
    queryFn: () => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request(
        `/tenant/onboarding/slug-availability?slug=${encodeURIComponent(suggestedSlug)}`,
        { schema: z.object({ available: z.boolean() }), tenantPublicId: selectedTenant },
      );
    },
    enabled: selectedTenant !== undefined && suggestedSlug.length >= 2,
    retry: false,
  });
  const onboardingChecklist = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding-checklist'],
    queryFn: () =>
      httpClient.request('/tenant/onboarding/checklist', {
        schema: OnboardingChecklistSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    enabled: selectedTenant !== undefined && onboarding.data?.onboardingCompletedAt !== null,
    retry: false,
  });
  useEffect(() => {
    const selection = new URLSearchParams(location.search);
    const planPublicId = selection.get('plan');
    const billingCycle = selection.get('billing');
    if (planPublicId === null || billingCycle === null) return;
    if (selectedTenant === undefined) {
      if (me.data === undefined || me.data.tenants.length > 0) return;
      void httpClient
        .request('/auth/onboarding', {
          method: 'POST',
          body: {
            name: me.data.user.email.split('@')[0] ?? 'Meu estabelecimento',
            planPublicId,
            billingCycle,
          },
          schema: z.object({ tenantPublicId: z.uuid() }),
        })
        .then((result) => {
          selectTenant(result.tenantPublicId);
          return navigate('/app', { replace: true });
        })
        .catch(() => undefined);
      return;
    }
    void httpClient
      .request('/tenant/subscription/select-plan', {
        method: 'POST',
        tenantPublicId: selectedTenant,
        body: { planPublicId, billingCycle },
        schema: TenantSubscriptionResponseSchema,
      })
      .then(() => navigate('/app', { replace: true }))
      .catch(() => undefined);
  }, [location.search, me.data, navigate, selectedTenant]);
  const finishSession = () => {
    clearSelectedTenant();
    queryClient.clear();
    void navigate('/login');
  };
  const revokeSession = useMutation({
    mutationFn: (sessionPublicId: string) =>
      httpClient.request(`/auth/sessions/${sessionPublicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
      }),
    onSuccess: (_result, sessionPublicId) => {
      if (
        sessions.data?.sessions.some(
          (session) => session.publicId === sessionPublicId && session.current,
        )
      ) {
        finishSession();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
  const logoutAll = useMutation({
    mutationFn: () =>
      httpClient.request('/auth/logout-all', {
        method: 'POST',
        body: {},
        schema: SuccessResponseSchema,
      }),
    onSuccess: finishSession,
  });
  const updateOnboarding = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/onboarding', {
        method: 'PATCH',
        tenantPublicId: selectedTenant,
        body,
        schema: OnboardingResponseSchema,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        onboarding.refetch(),
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', selectedTenant, 'experience'] }),
      ]);
    },
  });
  const savePublicTheme = useMutation({
    mutationFn: (theme: string) => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/public-site', {
        method: 'PATCH',
        tenantPublicId: selectedTenant,
        body: { theme },
        schema: z.unknown(),
      });
    },
  });
  const saveBranding = useMutation({
    mutationFn: (body: Record<string, string>) => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/branding', {
        method: 'PATCH',
        tenantPublicId: selectedTenant,
        body,
        schema: z.unknown(),
      });
    },
  });
  const uploadBrandAsset = useMutation({
    mutationFn: ({ kind, file }: { kind: 'LOGO' | 'SPLASH' | 'APP_ICON'; file: File }) => {
      if (selectedTenant === undefined)
        throw new Error('Selecione um estabelecimento para continuar.');
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(`/tenant/media/${kind}`, {
        method: 'POST',
        tenantPublicId: selectedTenant,
        body,
        schema: z.unknown(),
      });
    },
  });
  const onboardingActionError = [
    updateOnboarding.error,
    savePublicTheme.error,
    saveBranding.error,
    uploadBrandAsset.error,
  ].find((error): error is Error => error instanceof Error);

  const canUpdateTenantSettings =
    me.data?.currentTenant?.membership.permissions.includes('tenant.update') ?? false;
  const canManageUnits =
    (me.data?.currentTenant?.membership.permissions.includes('unit.create') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('unit.update') ?? false);
  const canReadUnits =
    me.data?.currentTenant?.membership.permissions.includes('unit.read') ?? false;
  const canFitIn =
    me.data?.currentTenant?.membership.permissions.includes('appointment.fit_in.manage') ?? false;
  const canCheckIn =
    me.data?.currentTenant?.membership.permissions.includes('appointment.checkin.manage') ?? false;
  const canReadPayments =
    me.data?.currentTenant?.membership.permissions.includes('payment.read') ?? false;
  const canManagePayments =
    me.data?.currentTenant?.membership.permissions.includes('payment.manage') ?? false;
  const canReadCash = me.data?.currentTenant?.membership.permissions.includes('cash.read') ?? false;
  const canManageCash =
    me.data?.currentTenant?.membership.permissions.includes('cash.manage') ?? false;
  const canReadCommissions =
    me.data?.currentTenant?.membership.permissions.includes('commission.read') ?? false;
  const canReadCoupons =
    me.data?.currentTenant?.membership.permissions.includes('coupon.read') ?? false;
  const canManageCoupons =
    me.data?.currentTenant?.membership.permissions.includes('coupon.manage') ?? false;
  const canReadLoyalty =
    me.data?.currentTenant?.membership.permissions.includes('loyalty.read') ?? false;
  const canManageLoyalty =
    me.data?.currentTenant?.membership.permissions.includes('loyalty.manage') ?? false;
  const canReadFinancialClosings =
    me.data?.currentTenant?.membership.permissions.includes('financial_closing.read') ?? false;
  const canManageFinancialClosings =
    me.data?.currentTenant?.membership.permissions.includes('financial_closing.manage') ?? false;
  const canReadFinancialReports =
    me.data?.currentTenant?.membership.permissions.includes('financial_report.read') ?? false;
  const canReadPaymentGateway =
    me.data?.currentTenant?.membership.permissions.includes('payment_gateway.read') ?? false;
  const canManagePaymentGateway =
    me.data?.currentTenant?.membership.permissions.includes('payment_gateway.manage') ?? false;
  const canViewOwnAgenda =
    me.data?.currentTenant?.membership.permissions.includes('professional.self.read') ?? false;
  const canReadMembers =
    me.data?.currentTenant?.membership.permissions.includes('membership.read') ?? false;
  const canManageMembers =
    (me.data?.currentTenant?.membership.permissions.includes('membership.invite') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('membership.update') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('membership.suspend') ?? false);
  const canViewSubscription =
    me.data?.currentTenant?.membership.permissions.includes('tenant.subscription.read') ?? false;
  const canViewOperations =
    me.data?.currentTenant?.membership.permissions.includes('appointment.read') ?? false;
  const canViewWaitlist =
    me.data?.currentTenant?.membership.permissions.includes('appointment.waitlist.read') ?? false;
  const canViewNotifications =
    me.data?.currentTenant?.membership.permissions.includes('notification.read') ?? false;
  const canManageNotificationTemplates =
    me.data?.currentTenant?.membership.permissions.includes('notification.template.manage') ??
    false;
  const canReadProducts =
    me.data?.currentTenant?.membership.permissions.includes('product.read') ?? false;
  const canManageProducts =
    me.data?.currentTenant?.membership.permissions.includes('product.manage') ?? false;
  const canSellProducts =
    me.data?.currentTenant?.membership.permissions.includes('product_sale.manage') ?? false;
  const canReadProductSales =
    me.data?.currentTenant?.membership.permissions.includes('product_sale.read') ?? false;
  const canManageBranding =
    me.data?.currentTenant?.membership.permissions.includes('tenant.branding.manage') ?? false;
  const canReadAutomations =
    me.data?.currentTenant?.membership.permissions.includes('automation.read') ?? false;
  const canManageAutomations =
    me.data?.currentTenant?.membership.permissions.includes('automation.manage') ?? false;
  const canReadIntegrations =
    me.data?.currentTenant?.membership.permissions.includes('integration.read') ?? false;
  const canManageIntegrations =
    me.data?.currentTenant?.membership.permissions.includes('integration.manage') ?? false;
  const canReadAppointments =
    me.data?.currentTenant?.membership.permissions.includes('appointment.read') ?? false;
  const canReadCustomers =
    me.data?.currentTenant?.membership.permissions.includes('customer.read') ?? false;
  const canReadServices =
    me.data?.currentTenant?.membership.permissions.includes('service.read') ?? false;
  const canReadProfessionals =
    me.data?.currentTenant?.membership.permissions.includes('professional.read') ?? false;
  const planFeatureEnabled = (key: PlanLimitKey) =>
    planAccess.data?.limits.find((limit) => limit.key === key)?.booleanValue !== false;
  const menuGroups: AppMenuGroup[] = [
    {
      label: 'Agenda',
      path: '/app/agenda',
      items: [
        { label: 'Visão da agenda', to: '/app/agenda', visible: canReadAppointments },
        { label: 'Minha agenda', to: '/app/agenda/minha', visible: canViewOwnAgenda },
        { label: 'Agendamentos', to: '/app/agenda/agendamentos', visible: canReadAppointments },
        { label: 'Disponibilidade', to: '/app/agenda/disponibilidade', visible: canViewOwnAgenda },
        {
          label: 'Lista de espera',
          to: '/app/agenda/lista-espera',
          visible: canViewWaitlist && planFeatureEnabled('waitlist.enabled'),
        },
      ],
    },
    {
      label: 'Clientes',
      path: '/app/clientes',
      items: [
        { label: 'Clientes', to: '/app/clientes', visible: canReadCustomers },
        { label: 'Recuperação', to: '/app/clientes/recuperacao', visible: canReadAutomations },
        {
          label: 'Fidelidade',
          to: '/app/clientes/fidelidade',
          visible: canReadLoyalty && planFeatureEnabled('loyalty.enabled'),
        },
        {
          label: 'Cupons',
          to: '/app/clientes/cupons',
          visible: canReadCoupons && planFeatureEnabled('coupons.enabled'),
        },
      ],
    },
    {
      label: 'Serviços',
      path: '/app/servicos',
      items: [
        { label: 'Serviços', to: '/app/servicos', visible: canReadServices },
        { label: 'Categorias', to: '/app/servicos/categorias', visible: canReadServices },
        { label: 'Combos', to: '/app/servicos/combos', visible: canReadServices },
      ],
    },
    {
      label: 'Equipe',
      path: '/app/equipe',
      items: [
        { label: 'Profissionais', to: '/app/equipe/profissionais', visible: canReadProfessionals },
        { label: 'Membros', to: '/app/equipe/membros', visible: canReadMembers },
        {
          label: 'Comissões',
          to: '/app/equipe/comissoes',
          visible: canReadCommissions && planFeatureEnabled('commissions.enabled'),
        },
      ],
    },
    {
      label: 'Financeiro',
      path: '/app/financeiro',
      items: [
        { label: 'Visão geral', to: '/app/financeiro', visible: canReadPayments },
        { label: 'Caixa', to: '/app/financeiro/caixa', visible: canReadCash },
        {
          label: 'Formas de pagamento',
          to: '/app/financeiro/pagamentos',
          visible: canReadPayments,
        },
        {
          label: 'Fechamentos',
          to: '/app/financeiro/fechamentos',
          visible: canReadFinancialClosings,
        },
        {
          label: 'Relatórios',
          to: '/app/financeiro/relatorios',
          visible: canReadFinancialReports && planFeatureEnabled('advanced_reports.enabled'),
        },
        {
          label: 'Opções de cobrança',
          to: '/app/financeiro/opcoes',
          visible: canReadPaymentGateway,
        },
      ],
    },
    {
      label: 'Produtos',
      path: '/app/produtos',
      items: [
        {
          label: 'Produtos',
          to: '/app/produtos',
          visible: canReadProducts && planFeatureEnabled('products.enabled'),
        },
        {
          label: 'Estoque',
          to: '/app/produtos/estoque',
          visible: canReadProducts && planFeatureEnabled('products.enabled'),
        },
        {
          label: 'Movimentações',
          to: '/app/produtos/movimentacoes',
          visible: canReadProducts && planFeatureEnabled('products.enabled'),
        },
      ],
    },
    {
      label: 'Marketing',
      path: '/app/marketing',
      items: [
        {
          label: 'Automações',
          to: '/app/marketing/automacoes',
          visible: canReadAutomations && planFeatureEnabled('automations.enabled'),
        },
        { label: 'Notificações', to: '/app/marketing/notificacoes', visible: canViewNotifications },
        {
          label: 'Modelos de mensagens',
          to: '/app/marketing/modelos',
          visible: canManageNotificationTemplates,
        },
      ],
    },
    {
      label: 'Minha empresa',
      path: '/app/empresa',
      items: [
        { label: 'Dados', to: '/app/empresa/dados', visible: canUpdateTenantSettings },
        {
          label: 'Marca e aparência',
          to: '/app/empresa/marca',
          visible: canManageBranding && planFeatureEnabled('branding.customization.enabled'),
        },
        {
          label: 'Banners',
          to: '/app/empresa/banners',
          visible: canManageBranding && planFeatureEnabled('branding.customization.enabled'),
        },
        {
          label: 'Página pública',
          to: '/app/empresa/pagina-publica',
          visible: canManageBranding && planFeatureEnabled('branding.customization.enabled'),
        },
        { label: 'Unidades', to: '/app/empresa/unidades', visible: canReadUnits },
        {
          label: 'Domínio',
          to: '/app/empresa/dominio',
          visible: canManageBranding && planFeatureEnabled('custom_domain.enabled'),
        },
        {
          label: 'Integrações',
          to: '/app/empresa/integracoes',
          visible: canReadIntegrations && planFeatureEnabled('integrations.enabled'),
        },
      ],
    },
    {
      label: 'Plano',
      path: '/app/plano',
      items: [{ label: 'Minha assinatura', to: '/app/plano', visible: canViewSubscription }],
    },
    {
      label: 'Configurações',
      path: '/app/configuracoes',
      items: [
        { label: 'Preferências', to: '/app/configuracoes', visible: canUpdateTenantSettings },
        { label: 'Sessões', to: '/app/configuracoes/sessoes', visible: true },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible) }))
    .filter((group) => group.items.length > 0);
  const activeMenuGroup = menuGroups.find((group) => location.pathname.startsWith(group.path));
  const activeMenuItem = activeMenuGroup?.items.find((item) => item.to === location.pathname);
  const pageTitle =
    location.pathname === '/app'
      ? 'Início'
      : (activeMenuItem?.label ?? activeMenuGroup?.label ?? 'Painel');

  useEffect(() => {
    if (me.error instanceof HttpError && me.error.status === 401) void navigate('/login');
    if (me.error instanceof HttpError && me.error.status === 403) void navigate('/access-denied');
  }, [me.error, navigate]);

  if (me.isPending)
    return (
      <main className="app-shell">
        <p>Carregando sessão…</p>
      </main>
    );
  if (me.data === undefined) return null;
  const isRoute = (...paths: string[]) => paths.includes(location.pathname);
  const previousStep =
    onboarding.data === undefined ? null : previousOnboardingStep(onboarding.data.onboardingStep);
  // O início guiado é uma experiência própria: ocupa a tela e esconde a navegação.
  const guidedData = onboarding.data;
  const guidedActive =
    selectedTenant !== undefined &&
    me.data.currentTenant?.membership.roleCode === 'OWNER' &&
    guidedData?.onboardingCompletedAt === null;
  const guidedStep = guidedData?.onboardingStep ?? 'WELCOME';
  const guidedStepIndex = Math.max(0, GUIDED_STEPS.indexOf(guidedStep));

  return (
    <main className={`app-shell${guidedActive && !guidedPaused ? ' is-onboarding' : ''}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">
            Início{activeMenuGroup === undefined ? '' : ` / ${activeMenuGroup.label}`}
          </p>
          <h1>{pageTitle}</h1>
          <p className="app-page-description">
            {me.data.currentTenant?.tenant.displayName ?? 'Selecione um estabelecimento'}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void httpClient
              .request('/auth/logout', { method: 'POST', body: {}, schema: SuccessResponseSchema })
              .finally(finishSession);
          }}
        >
          Sair
        </button>
      </header>
      {guidedActive && guidedPaused && (
        <button
          className="onboarding-resume"
          type="button"
          onClick={() => {
            pauseGuided(false);
          }}
        >
          <span>Continuar configuração</span>
          <small>{`Etapa ${String(guidedStepIndex + 1)} de ${String(GUIDED_STEPS.length)}`}</small>
        </button>
      )}
      {guidedActive && !guidedPaused && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Início guiado">
          <section className="onboarding-welcome" aria-label="Primeiros passos">
            <header className="onboarding-topbar">
              {previousStep === null ? (
                <span />
              ) : (
                <button
                  className="onboarding-back"
                  aria-label="Voltar"
                  onClick={() => {
                    updateOnboarding.mutate({ step: previousStep });
                  }}
                >
                  ←
                </button>
              )}
              <span className="onboarding-progress" aria-label={`Etapa ${String(guidedStepIndex + 1)} de ${String(GUIDED_STEPS.length)}`}>
                {GUIDED_STEPS.map((id, position) => (
                  <i key={id} className={position <= guidedStepIndex ? 'is-done' : ''} />
                ))}
              </span>
              <button
                className="onboarding-exit"
                type="button"
                onClick={() => {
                  pauseGuided(true);
                }}
              >
                Sair do início guiado
              </button>
            </header>
            <div className="onboarding-body">
            {guidedStep === 'WELCOME' && (
              <>
                <h2>Vamos criar sua empresa?</h2>
                <p>
                  Em poucos passos vamos preparar sua página de agendamentos e deixar a Agendei com
                  a identidade do seu negócio.
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    updateOnboarding.mutate({ step: 'BUSINESS_TYPE' });
                  }}
                >
                  Começar
                </button>
              </>
            )}
            {guidedStep === 'BUSINESS_TYPE' && (
              <>
                <h2>Qual é o tipo do seu negócio?</h2>
                <label>
                  Tipo de negócio
                  <select
                    value={profile}
                    onChange={(event) => {
                      setProfile(event.target.value);
                    }}
                  >
                    {Object.values(BusinessProfileCatalog).map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.publicName}
                      </option>
                    ))}
                  </select>
                </label>
                {profile === 'GENERIC' && (
                  <label>
                    Conte um pouco sobre o seu negócio
                    <input
                      value={customBusinessType}
                      onChange={(event) => {
                        setCustomBusinessType(event.target.value);
                      }}
                      placeholder="Ex.: Clínica veterinária"
                    />
                  </label>
                )}
                <button
                  className="primary-button"
                  disabled={profile === 'GENERIC' && customBusinessType.trim().length < 2}
                  onClick={() => {
                    updateOnboarding.mutate({
                      step: 'STARTER_CONTENT',
                      businessProfile: profile,
                      ...(profile === 'GENERIC'
                        ? { businessTypeCustom: customBusinessType.trim() }
                        : { businessTypeCustom: null }),
                    });
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {guidedStep === 'STARTER_CONTENT' && (
              <>
                <h2>Preparamos seu espaço para você começar mais rápido.</h2>
                <p>
                  Adicionamos alguns serviços, um profissional, horários e conteúdo de exemplo com
                  base no seu tipo de negócio. Você pode editar ou excluir tudo e criar seus
                  próprios dados quando quiser.
                </p>
                <ul className="onboarding-checklist-preview">
                  <li>3 serviços com ícones</li>
                  <li>1 combo</li>
                  <li>1 profissional</li>
                  <li>agenda de segunda a sábado, das 09:00 às 18:00</li>
                  <li>visual inicial do aplicativo</li>
                </ul>
                <button
                  className="primary-button"
                  onClick={() => {
                    updateOnboarding.mutate({ step: 'BUSINESS_IDENTITY' });
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {guidedStep === 'BUSINESS_IDENTITY' && (
              <>
                <h2>Como seus clientes conhecem sua empresa?</h2>
                <p>
                  Este é o nome que seus clientes verão no aplicativo e na página de agendamento.
                </p>
                <label>
                  Nome a ser exibido
                  <input
                    value={businessName}
                    onChange={(event) => {
                      setBusinessName(event.target.value);
                    }}
                    placeholder={me.data.currentTenant?.tenant.displayName ?? ''}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={businessName.trim().length < 2}
                  onClick={() => {
                    updateOnboarding.mutate({
                      step: 'BUSINESS_ADDRESS',
                      displayName: businessName.trim(),
                    });
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {guidedStep === 'BUSINESS_ADDRESS' && (
              <>
                <h2>Escolha o endereço do seu aplicativo</h2>
                <p>
                  Escolha com atenção. Por segurança e consistência dos seus links, o endereço
                  poderá ser alterado somente uma vez.
                </p>
                <label>
                  Endereço público
                  <input value={suggestedSlug} readOnly aria-describedby="slug-help" />
                  <small id="slug-help">
                    {suggestedSlug.length < 2
                      ? 'Volte e informe o nome para gerar o endereço.'
                      : slugAvailability.isPending
                        ? 'Verificando disponibilidade…'
                        : slugAvailability.data?.available
                          ? `Disponível: ${window.location.origin}/public/${suggestedSlug}`
                          : 'Este endereço já está em uso. Volte e ajuste o nome.'}
                  </small>
                </label>
                <button
                  className="primary-button"
                  disabled={!slugAvailability.data?.available}
                  onClick={() => {
                    updateOnboarding.mutate({ step: 'CUSTOMIZE', slug: suggestedSlug });
                  }}
                >
                  Confirmar endereço
                </button>
              </>
            )}
            {guidedStep === 'CUSTOMIZE' && (
              <>
                <h2>Agora vamos colocar sua marca</h2>
                <BrandAssetDropzone
                  title="Logo da empresa"
                  description="Envie um logo em PNG, JPG ou WebP."
                  busy={uploadBrandAsset.isPending}
                  onUpload={(file) => {
                    uploadBrandAsset.mutate({ kind: 'LOGO', file });
                  }}
                />
                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'LAYOUT' });
                    }}
                  >
                    Continuar
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'LAYOUT' });
                    }}
                  >
                    Continuar sem logo
                  </button>
                </div>
              </>
            )}
            {guidedStep === 'LAYOUT' && (
              <>
                <h2>Como você quer apresentar seu negócio?</h2>
                <p>Escolha um tema real da sua página pública.</p>
                <BrandThemePicker value={publicTheme} onChange={setPublicTheme} />
                <button
                  className="primary-button"
                  disabled={savePublicTheme.isPending || updateOnboarding.isPending}
                  onClick={() => {
                    void persistLayoutAndAdvance({
                      theme: publicTheme,
                      persistTheme: (theme) => savePublicTheme.mutateAsync(theme),
                      advance: (step) => updateOnboarding.mutateAsync({ step }),
                    }).catch(() => undefined);
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {guidedStep === 'COLORS' && (
              <>
                <h2>Escolha as cores da sua empresa</h2>
                <BrandColorPicker value={primaryColor} onChange={setPrimaryColor} />
                <button
                  className="primary-button"
                  onClick={() => {
                    saveBranding.mutate(deriveBrandPalette(primaryColor), {
                      onSuccess: () => {
                        updateOnboarding.mutate({ step: 'SPLASH' });
                      },
                    });
                  }}
                >
                  Continuar
                </button>
              </>
            )}
            {guidedStep === 'SPLASH' && (
              <>
                <h2>Como seu aplicativo deve aparecer ao abrir?</h2>
                <BrandAssetDropzone
                  title="Tela de abertura"
                  description="Use uma imagem vertical; sem envio, o logo será usado."
                  busy={uploadBrandAsset.isPending}
                  onUpload={(file) => {
                    uploadBrandAsset.mutate({ kind: 'SPLASH', file });
                  }}
                />
                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'APP_ICON' });
                    }}
                  >
                    Continuar
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'APP_ICON' });
                    }}
                  >
                    Fazer depois
                  </button>
                </div>
              </>
            )}
            {guidedStep === 'APP_ICON' && (
              <>
                <h2>Escolha o ícone do seu aplicativo</h2>
                <BrandAssetDropzone
                  title="Ícone do aplicativo"
                  description="Use uma imagem quadrada para a tela inicial."
                  busy={uploadBrandAsset.isPending}
                  square
                  onUpload={(file) => {
                    uploadBrandAsset.mutate({ kind: 'APP_ICON', file });
                  }}
                />
                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'READY' });
                    }}
                  >
                    Continuar
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      updateOnboarding.mutate({ step: 'READY' });
                    }}
                  >
                    Fazer depois
                  </button>
                </div>
              </>
            )}
            {guidedStep === 'READY' && (
              <>
                <h2>Seu espaço está ficando com a sua cara.</h2>
                <BrandPreview
                  displayName={effectiveBusinessName}
                  theme={publicTheme}
                  color={primaryColor}
                  logoUrl={onboardingLogoUrl}
                  mode="mobile"
                />
                <p>
                  Seu aplicativo já tem serviços, profissional e horários. Veja como ficou ou vá
                  direto para o painel.
                </p>
                <div className="onboarding-final-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      updateOnboarding.mutate(
                        { step: 'COMPLETE', completed: true },
                        {
                          onSuccess: () => {
                            pauseGuided(false);
                            if (onboardingBrand.data !== undefined)
                              window.open(`/public/${onboardingBrand.data.slug}`, '_blank');
                          },
                        },
                      );
                    }}
                  >
                    Ver meu aplicativo
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      updateOnboarding.mutate(
                        { step: 'COMPLETE', completed: true },
                        {
                          onSuccess: () => {
                            pauseGuided(false);
                            void navigate('/app');
                          },
                        },
                      );
                    }}
                  >
                    Ir para o painel
                  </button>
                </div>
              </>
            )}
            {onboardingActionError !== undefined && (
              <p className="form-error">{onboardingActionError.message}</p>
            )}
            </div>
          </section>
        </div>
      )}
      <nav className="app-navigation" aria-label="Navegação principal">
        <strong className="app-navigation-brand">
          {me.data.currentTenant?.tenant.displayName ?? 'Agendei'}
        </strong>
        {/* Só esta área rola: a identidade acima fica fixa e nunca recebe itens por baixo. */}
        <div className="app-navigation-scroll">
          <NavLink to="/app" end>
            ⌂ Início
          </NavLink>
          {menuGroups.map((group) => (
            <details
              key={group.path}
              open={expandedGroups[group.path] ?? location.pathname.startsWith(group.path)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpandedGroups((current) => ({ ...current, [group.path]: open }));
              }}
            >
              <summary>{group.label}</summary>
              <div className="app-navigation-submenu">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </details>
          ))}
        </div>
      </nav>
      <nav className="app-mobile-nav" aria-label="Navegação móvel">
        <NavLink to="/app" end>
          <span aria-hidden="true">⌂</span>Início
        </NavLink>
        {canReadAppointments && (
          <NavLink to="/app/agenda">
            <span aria-hidden="true">▦</span>Agenda
          </NavLink>
        )}
        <button
          className="mobile-plus"
          aria-expanded={quickActionsOpen}
          onClick={() => {
            setQuickActionsOpen((open) => !open);
          }}
        >
          +
        </button>
        {canReadCustomers && (
          <NavLink to="/app/clientes">
            <span aria-hidden="true">◎</span>Clientes
          </NavLink>
        )}
        <button
          aria-expanded={mobileMenuOpen}
          onClick={() => {
            setMobileMenuOpen((open) => !open);
          }}
        >
          <span aria-hidden="true">•••</span>Mais
        </button>
      </nav>
      {quickActionsOpen && (
        <div className="mobile-sheet" role="dialog" aria-label="Ações rápidas">
          <button
            onClick={() => {
              setQuickActionsOpen(false);
              void navigate('/app/agenda/agendamentos');
            }}
          >
            Novo agendamento
          </button>
          <button
            onClick={() => {
              setQuickActionsOpen(false);
              void navigate('/app/clientes');
            }}
          >
            Novo cliente
          </button>
          <button
            onClick={() => {
              setQuickActionsOpen(false);
              void navigate('/app/servicos');
            }}
          >
            Novo serviço
          </button>
          {canSellProducts && (
            <button
              onClick={() => {
                setQuickActionsOpen(false);
                void navigate('/app/produtos');
              }}
            >
              Nova venda
            </button>
          )}
        </div>
      )}
      {mobileMenuOpen && (
        <div className="mobile-sheet mobile-menu-sheet" role="dialog" aria-label="Mais opções">
          {menuGroups.map((group) => (
            <details
              key={group.path}
              open={expandedGroups[group.path] ?? location.pathname.startsWith(group.path)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpandedGroups((current) => ({ ...current, [group.path]: open }));
              }}
            >
              <summary>{group.label}</summary>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={() => {
                    setMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </NavLink>
              ))}
            </details>
          ))}
        </div>
      )}
      {isRoute('/app') &&
        onboardingChecklist.data !== undefined &&
        !onboardingChecklist.data.hidden && (
          <section className="onboarding-checklist" aria-labelledby="onboarding-checklist-title">
            <div>
              <p className="eyebrow">Primeiros passos</p>
              <h2 id="onboarding-checklist-title">
                {onboardingChecklist.data.items.filter((item) => item.complete).length} de{' '}
                {onboardingChecklist.data.items.length} concluídos
              </h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                updateOnboarding.mutate({
                  step: onboarding.data?.onboardingStep ?? 'COMPLETE',
                  hideChecklist: true,
                });
              }}
            >
              Ocultar
            </button>
            <ul>
              {onboardingChecklist.data.items.map((item) => (
                <li key={item.key} className={item.complete ? 'complete' : undefined}>
                  {item.complete ? '✓' : '○'}{' '}
                  {
                    (
                      {
                        company: 'Criar sua empresa',
                        branding: 'Personalizar sua marca',
                        service: 'Criar primeiro serviço',
                        professional: 'Adicionar profissional',
                        schedule: 'Definir horários',
                        appointment: 'Testar primeiro agendamento',
                        share: 'Compartilhar sua página',
                      } as Record<string, string>
                    )[item.key]
                  }
                </li>
              ))}
            </ul>
          </section>
        )}
      {me.data.tenants.length > 1 || me.data.currentTenant === null ? (
        <button className="text-button" onClick={() => void navigate('/select-tenant')}>
          {me.data.currentTenant === null ? 'Selecionar estabelecimento' : 'Trocar estabelecimento'}
        </button>
      ) : null}
      {selectedTenant !== undefined && me.data.currentTenant !== null && (
        <ErrorBoundary
          area={pageTitle.toLocaleLowerCase('pt-BR')}
          onRetry={() => {
            void queryClient.invalidateQueries({ queryKey: ['tenant', selectedTenant] });
          }}
          onBack={() => {
            void navigate('/app');
          }}
        >
          <Suspense
            fallback={
              <section className="module-loading" aria-busy="true">
                <span className="loading-spinner" />
                Carregando área…
              </section>
            }
          >
            {isRoute('/app/configuracoes') && (
              <TenantSettingsModule
                tenantPublicId={selectedTenant}
                canUpdate={canUpdateTenantSettings}
              />
            )}
            {isRoute('/app/empresa', '/app/empresa/dados') && canUpdateTenantSettings && (
              <CompanyDataModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/empresa/unidades') && (
              <UnitsModule tenantPublicId={selectedTenant} canManage={canManageUnits} />
            )}
            {isRoute('/app/empresa/unidades') && canReadUnits && (
              <MultiUnitOverviewModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/plano') && canViewSubscription && (
              <TenantSubscriptionModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app') && canViewOperations && (
              <OperationsDashboardModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/financeiro/pagamentos') && canReadPayments && (
              <PaymentMethodsModule tenantPublicId={selectedTenant} canManage={canManagePayments} />
            )}
            {isRoute('/app/financeiro/caixa') && canReadCash && (
              <CashRegisterModule tenantPublicId={selectedTenant} canManage={canManageCash} />
            )}
            {isRoute('/app/equipe/comissoes') &&
              canReadCommissions &&
              planFeatureEnabled('commissions.enabled') && (
                <CommissionsModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/clientes/cupons') &&
              canReadCoupons &&
              planFeatureEnabled('coupons.enabled') && (
                <CouponsModule tenantPublicId={selectedTenant} canManage={canManageCoupons} />
              )}
            {isRoute('/app/clientes/fidelidade') &&
              canReadLoyalty &&
              planFeatureEnabled('loyalty.enabled') && (
                <LoyaltyModule tenantPublicId={selectedTenant} canManage={canManageLoyalty} />
              )}
            {isRoute('/app/produtos') && canReadProducts && !planFeatureEnabled('products.enabled') && (
              <section className="sessions-panel">
                <PageHeader
                  eyebrow="Catálogo"
                  title="Produtos"
                  description="Controle de produtos e estoque não está incluído no seu plano atual."
                  actions={
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void navigate('/app/plano')}
                    >
                      Ver planos
                    </button>
                  }
                />
              </section>
            )}
            {isRoute('/app/produtos') &&
              canReadProducts &&
              planFeatureEnabled('products.enabled') && (
                <ProductCatalog
                  tenantPublicId={selectedTenant}
                  canManage={canManageProducts}
                  canSell={canSellProducts}
                />
              )}
            {isRoute('/app/produtos/estoque') &&
              canReadProducts &&
              planFeatureEnabled('products.enabled') && (
                <ProductStockModule
                  tenantPublicId={selectedTenant}
                  canManage={canManageProducts}
                />
              )}
            {isRoute('/app/produtos/movimentacoes') &&
              canReadProducts &&
              planFeatureEnabled('products.enabled') && (
                <ProductMovementsModule tenantPublicId={selectedTenant} />
              )}
            {location.pathname.startsWith('/app/produtos/') &&
              !isRoute('/app/produtos/estoque', '/app/produtos/movimentacoes') &&
              canReadProducts &&
              planFeatureEnabled('products.enabled') && (
                <ProductProfile
                  tenantPublicId={selectedTenant}
                  publicId={location.pathname.slice('/app/produtos/'.length)}
                  canManage={canManageProducts}
                  canReadSales={canReadProductSales}
                />
              )}
            {isRoute('/app/financeiro/fechamentos') && canReadFinancialClosings && (
              <FinancialClosingModule
                tenantPublicId={selectedTenant}
                canManage={canManageFinancialClosings}
              />
            )}
            {isRoute('/app/financeiro') && canReadPayments && (
              <DelinquencyModule
                tenantPublicId={selectedTenant}
                showSummary={
                  canReadFinancialReports && planFeatureEnabled('advanced_reports.enabled')
                }
              />
            )}
            {isRoute('/app/financeiro/relatorios') &&
              canReadFinancialReports &&
              planFeatureEnabled('advanced_reports.enabled') && (
                <FinancialReportModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/financeiro/opcoes') && canReadPaymentGateway && (
              <PaymentOptionsModule
                tenantPublicId={selectedTenant}
                canManage={canManagePaymentGateway}
              />
            )}
            {isRoute('/app/marketing/notificacoes') && canViewNotifications && (
              <NotificationLogModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/marketing/modelos') && canViewNotifications && (
              <NotificationTemplateModule
                tenantPublicId={selectedTenant}
                canManage={canManageNotificationTemplates}
              />
            )}
            {isRoute('/app/marketing', '/app/marketing/automacoes', '/app/clientes/recuperacao') &&
              canReadAutomations &&
              planFeatureEnabled('automations.enabled') && (
                <CustomerRecoveryModule
                  tenantPublicId={selectedTenant}
                  canManage={canManageAutomations}
                />
              )}
            {isRoute('/app/equipe/membros') && canReadMembers && (
              <MembersModule tenantPublicId={selectedTenant} canManage={canManageMembers} />
            )}
            {isRoute('/app/agenda') && canReadAppointments && (
              <CalendarModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/agenda/minha') && canViewOwnAgenda && (
              <MyAgendaModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/agenda/disponibilidade') && canViewOwnAgenda && (
              <MyAvailabilityModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/equipe/comissoes') && canViewOwnAgenda && (
              <MyCommissionsModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/agenda/agendamentos') && canReadAppointments && (
              <AppointmentModule
                tenantPublicId={selectedTenant}
                canFitIn={canFitIn}
                canCheckIn={canCheckIn}
                canReadPayments={canReadPayments}
                canManagePayments={canManagePayments}
              />
            )}
            {isRoute('/app/agenda/lista-espera') &&
              canViewWaitlist &&
              planFeatureEnabled('waitlist.enabled') && (
                <AppointmentWaitlistModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/servicos/categorias') && canReadServices && (
              <ServiceCategoryModule tenantPublicId={selectedTenant} />
            )}
            {(isRoute('/app/equipe/profissionais') ||
              location.pathname.startsWith('/app/equipe/profissionais/')) &&
              canReadProfessionals && (
                <ProfessionalModule
                  tenantPublicId={selectedTenant}
                  terminology={experience.data?.terminology.professional.singular ?? 'Profissional'}
                />
              )}
            {isRoute('/app/clientes') && canReadCustomers && (
              <CustomerModule
                tenantPublicId={selectedTenant}
                terminology={experience.data?.terminology.customer.singular ?? 'Cliente'}
              />
            )}
            {location.pathname.startsWith('/app/clientes/') &&
              !isRoute(
                '/app/clientes/recuperacao',
                '/app/clientes/fidelidade',
                '/app/clientes/cupons',
              ) &&
              canReadCustomers && (
                <CustomerProfile
                  tenantPublicId={selectedTenant}
                  publicId={location.pathname.slice('/app/clientes/'.length)}
                  terminology={experience.data?.terminology.customer.singular ?? 'Cliente'}
                />
              )}
            {isRoute('/app/servicos') && canReadServices && (
              <ServiceModule
                tenantPublicId={selectedTenant}
                terminology={experience.data?.terminology.service.singular ?? 'Servi\u00e7o'}
              />
            )}
            {isRoute('/app/servicos/novo') && canReadServices && (
              <ServiceCreatePage
                tenantPublicId={selectedTenant}
                terminology={experience.data?.terminology.service.singular ?? 'Serviço'}
              />
            )}
            {location.pathname.startsWith('/app/servicos/') &&
              !isRoute('/app/servicos/categorias', '/app/servicos/combos', '/app/servicos/novo') &&
              canReadServices && (
                <ServiceProfile
                  tenantPublicId={selectedTenant}
                  publicId={location.pathname.slice('/app/servicos/'.length)}
                />
              )}
            {isRoute('/app/servicos/combos') && canReadServices && (
              <ComboModule tenantPublicId={selectedTenant} />
            )}
            {isRoute('/app/empresa/marca') &&
              canManageBranding &&
              planFeatureEnabled('branding.customization.enabled') && (
                <WhiteLabelModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/empresa/banners') &&
              canManageBranding &&
              planFeatureEnabled('branding.customization.enabled') && (
                <BannersModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/empresa/pagina-publica') &&
              canManageBranding &&
              planFeatureEnabled('branding.customization.enabled') && (
                <PublicPageSettingsModule tenantPublicId={selectedTenant} />
              )}
            {isRoute('/app/empresa/dominio') &&
              canManageBranding &&
              planFeatureEnabled('custom_domain.enabled') && (
                <TenantDomainModule tenantPublicId={selectedTenant} canManage={canManageBranding} />
              )}
            {isRoute('/app/empresa/integracoes') &&
              canReadIntegrations &&
              planFeatureEnabled('integrations.enabled') && (
                <IntegrationsModule
                  tenantPublicId={selectedTenant}
                  canManage={canManageIntegrations}
                />
              )}
          </Suspense>
        </ErrorBoundary>
      )}
      {isRoute('/app/configuracoes/sessoes') && (
        <section className="sessions-panel" aria-labelledby="sessions-title">
          <div className="sessions-heading">
            <div>
              <p className="eyebrow">Segurança</p>
              <h2 id="sessions-title">Sessões ativas</h2>
            </div>
            <button
              className="secondary-button"
              disabled={logoutAll.isPending}
              onClick={() => {
                logoutAll.mutate();
              }}
            >
              Encerrar todas
            </button>
          </div>
          {sessions.isPending ? <p>Carregando sessões…</p> : null}
          {sessions.error instanceof Error ? (
            <p className="form-error">Não foi possível carregar as sessões.</p>
          ) : null}
          {revokeSession.error instanceof Error || logoutAll.error instanceof Error ? (
            <p className="form-error">Não foi possível encerrar a sessão.</p>
          ) : null}
          <div className="sessions-list">
            {sessions.data?.sessions.map((session) => (
              <article className="session-item" key={session.publicId}>
                <div>
                  <strong>
                    {session.current
                      ? 'Esta sessão'
                      : (session.userAgent ?? 'Dispositivo não identificado')}
                  </strong>
                  <span>
                    Último acesso em {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                    {session.ipAddress === null ? '' : ` · IP ${session.ipAddress}`}
                  </span>
                </div>
                <button
                  className="secondary-button"
                  disabled={revokeSession.isPending}
                  onClick={() => {
                    revokeSession.mutate(session.publicId);
                  }}
                >
                  Encerrar
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
