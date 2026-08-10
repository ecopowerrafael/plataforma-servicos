import {
  AuthMeResponseSchema,
  AuthSessionsResponseSchema,
  BusinessProfileCatalog,
  HealthResponseSchema,
  SuccessResponseSchema,
  TenantExperienceResponseSchema,
  TenantSubscriptionResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { HttpError, httpClient } from '../lib/http.js';
import { clearSelectedTenant, readSelectedTenant, selectTenant } from '../lib/tenant-selection.js';

// Dynamic module boundaries keep inactive product areas out of the initial panel bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = <T extends ComponentType<any>, K extends string>(module: Promise<Record<K, T>>, key: K) =>
  lazy(async () => ({ default: (await module)[key] }));
const AppointmentModule = load(import('../components/appointments/AppointmentModule.js'), 'AppointmentModule');
const AppointmentWaitlistModule = load(import('../components/appointments/AppointmentWaitlistModule.js'), 'AppointmentWaitlistModule');
const CalendarModule = load(import('../components/calendar/CalendarModule.js'), 'CalendarModule');
const CustomerModule = load(import('../components/customers/CustomerModule.js'), 'CustomerModule');
const MyAgendaModule = load(import('../components/professionals/MyAgendaModule.js'), 'MyAgendaModule');
const MyAvailabilityModule = load(import('../components/professionals/MyAvailabilityModule.js'), 'MyAvailabilityModule');
const MyCommissionsModule = load(import('../components/professionals/MyCommissionsModule.js'), 'MyCommissionsModule');
const ProfessionalModule = load(import('../components/professionals/ProfessionalModule.js'), 'ProfessionalModule');
const ComboModule = load(import('../components/services/ComboModule.js'), 'ComboModule');
const ServiceCategoryModule = load(import('../components/services/ServiceCategoryModule.js'), 'ServiceCategoryModule');
const ServiceModule = load(import('../components/services/ServiceModule.js'), 'ServiceModule');
const CashRegisterModule = load(import('../components/tenants/CashRegisterModule.js'), 'CashRegisterModule');
const CommissionsModule = load(import('../components/tenants/CommissionsModule.js'), 'CommissionsModule');
const CouponsModule = load(import('../components/tenants/CouponsModule.js'), 'CouponsModule');
const CustomerRecoveryModule = load(import('../components/tenants/CustomerRecoveryModule.js'), 'CustomerRecoveryModule');
const DelinquencyModule = load(import('../components/tenants/DelinquencyModule.js'), 'DelinquencyModule');
const FinancialClosingModule = load(import('../components/tenants/FinancialClosingModule.js'), 'FinancialClosingModule');
const FinancialReportModule = load(import('../components/tenants/FinancialReportModule.js'), 'FinancialReportModule');
const IntegrationsModule = load(import('../components/tenants/IntegrationsModule.js'), 'IntegrationsModule');
const LoyaltyModule = load(import('../components/tenants/LoyaltyModule.js'), 'LoyaltyModule');
const MembersModule = load(import('../components/tenants/MembersModule.js'), 'MembersModule');
const MultiUnitOverviewModule = load(import('../components/tenants/MultiUnitOverviewModule.js'), 'MultiUnitOverviewModule');
const NotificationLogModule = load(import('../components/tenants/NotificationLogModule.js'), 'NotificationLogModule');
const NotificationTemplateModule = load(import('../components/tenants/NotificationTemplateModule.js'), 'NotificationTemplateModule');
const OperationsDashboardModule = load(import('../components/tenants/OperationsDashboardModule.js'), 'OperationsDashboardModule');
const PaymentGatewayModule = load(import('../components/tenants/PaymentGatewayModule.js'), 'PaymentGatewayModule');
const PaymentMethodsModule = load(import('../components/tenants/PaymentMethodsModule.js'), 'PaymentMethodsModule');
const PaymentOptionsModule = load(import('../components/tenants/PaymentOptionsModule.js'), 'PaymentOptionsModule');
const ProductInventoryModule = load(import('../components/tenants/ProductInventoryModule.js'), 'ProductInventoryModule');
const TenantDomainModule = load(import('../components/tenants/TenantDomainModule.js'), 'TenantDomainModule');
const TenantSettingsModule = load(import('../components/tenants/TenantSettingsModule.js'), 'TenantSettingsModule');
const TenantSubscriptionModule = load(import('../components/tenants/TenantSubscriptionModule.js'), 'TenantSubscriptionModule');
const UnitsModule = load(import('../components/tenants/UnitsModule.js'), 'UnitsModule');
const WhiteLabelModule = load(import('../components/tenants/WhiteLabelModule.js'), 'WhiteLabelModule');

const OnboardingResponseSchema = z.object({
  onboardingStep: z.string(),
  onboardingCompletedAt: z.string().nullable(),
  onboardingChecklistHiddenAt: z.string().nullable(),
});
const OnboardingChecklistSchema = z.object({
  hidden: z.boolean(),
  items: z.array(z.object({ key: z.string(), complete: z.boolean() })),
});

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim().replace(/[^a-z0-9]+/gu, '-').replace(/(^-|-$)/gu, '').slice(0, 63);
}

function previousOnboardingStep(step: string): string | null {
  return ({ BUSINESS_TYPE: 'WELCOME', BUSINESS_IDENTITY: 'BUSINESS_TYPE', CUSTOMIZE: 'BUSINESS_IDENTITY', LAYOUT: 'CUSTOMIZE', COLORS: 'LAYOUT', SPLASH: 'COLORS', APP_ICON: 'SPLASH', READY: 'APP_ICON' } as Record<string, string>)[step] ?? null;
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const selectedTenant = readSelectedTenant();
  const [profile, setProfile] = useState('GENERIC');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [publicTheme, setPublicTheme] = useState('MODERN');
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [secondaryColor, setSecondaryColor] = useState('#1E40AF');
  const [accentColor, setAccentColor] = useState('#F59E0B');
  const [businessName, setBusinessName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const me = useQuery({
    queryKey: ['auth', 'me', selectedTenant],
    queryFn: () =>
      httpClient.request('/auth/me', {
        schema: AuthMeResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    retry: false,
  });
  const health = useQuery({
    queryKey: ['api', 'health'],
    queryFn: () => httpClient.request('/health', { schema: HealthResponseSchema }),
    refetchInterval: 60_000,
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
  const onboarding = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding'],
    queryFn: () => httpClient.request('/tenant/onboarding', { schema: OnboardingResponseSchema, ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }) }),
    enabled: selectedTenant !== undefined,
    retry: false,
  });
  const suggestedSlug = slugify(businessName);
  const slugAvailability = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding-slug', suggestedSlug],
    queryFn: () => {
      if (selectedTenant === undefined) throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request(`/tenant/onboarding/slug-availability?slug=${encodeURIComponent(suggestedSlug)}`, { schema: z.object({ available: z.boolean() }), tenantPublicId: selectedTenant });
    },
    enabled: selectedTenant !== undefined && suggestedSlug.length >= 2,
    retry: false,
  });
  const onboardingChecklist = useQuery({
    queryKey: ['tenant', selectedTenant, 'onboarding-checklist'],
    queryFn: () => httpClient.request('/tenant/onboarding/checklist', { schema: OnboardingChecklistSchema, ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }) }),
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
      void httpClient.request('/auth/onboarding', { method: 'POST', body: { name: me.data.user.email.split('@')[0] ?? 'Meu estabelecimento', planPublicId, billingCycle }, schema: z.object({ tenantPublicId: z.uuid() }) })
        .then((result) => { selectTenant(result.tenantPublicId); return navigate('/app', { replace: true }); })
        .catch(() => undefined);
      return;
    }
    void httpClient.request('/tenant/subscription/select-plan', {
      method: 'POST', tenantPublicId: selectedTenant,
      body: { planPublicId, billingCycle }, schema: TenantSubscriptionResponseSchema,
    }).then(() => navigate('/app', { replace: true })).catch(() => undefined);
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
      if (selectedTenant === undefined) throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/onboarding', { method: 'PATCH', tenantPublicId: selectedTenant, body, schema: OnboardingResponseSchema });
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
      if (selectedTenant === undefined) throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/public-site', { method: 'PATCH', tenantPublicId: selectedTenant, body: { theme }, schema: z.unknown() });
    },
  });
  const saveBranding = useMutation({
    mutationFn: (body: Record<string, string>) => {
      if (selectedTenant === undefined) throw new Error('Selecione um estabelecimento para continuar.');
      return httpClient.request('/tenant/branding', { method: 'PATCH', tenantPublicId: selectedTenant, body, schema: z.unknown() });
    },
  });
  const uploadBrandAsset = useMutation({
    mutationFn: ({ kind, file }: { kind: 'LOGO' | 'SPLASH' | 'APP_ICON'; file: File }) => {
      if (selectedTenant === undefined) throw new Error('Selecione um estabelecimento para continuar.');
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(`/tenant/media/${kind}`, { method: 'POST', tenantPublicId: selectedTenant, body, schema: z.unknown() });
    },
  });

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
  const area = location.pathname.split('/')[2] ?? 'inicio';
  const inArea = (...areas: string[]) => areas.includes(area);
  const previousStep = onboarding.data === undefined ? null : previousOnboardingStep(onboarding.data.onboardingStep);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Sessão atual</p>
          <h1>{me.data.currentTenant?.tenant.displayName ?? 'Selecione um estabelecimento'}</h1>
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
      {selectedTenant !== undefined && me.data.currentTenant?.membership.roleCode === 'OWNER' && onboarding.data?.onboardingCompletedAt === null && (
        <section className="onboarding-welcome" aria-label="Primeiros passos">
          <p className="eyebrow">Primeiros passos</p>
          {previousStep !== null && <button className="text-button" onClick={() => { updateOnboarding.mutate({ step: previousStep }); }}>Voltar</button>}
          {onboarding.data.onboardingStep === 'WELCOME' && <><h2>Vamos criar sua empresa?</h2><p>Em poucos passos vamos preparar sua página de agendamentos e deixar a Agendei com a identidade do seu negócio.</p><button className="primary-button" onClick={() => { updateOnboarding.mutate({ step: 'BUSINESS_TYPE' }); }}>Começar</button></>}
          {onboarding.data.onboardingStep === 'BUSINESS_TYPE' && <><h2>Qual é o tipo do seu negócio?</h2><label>Tipo de negócio<select value={profile} onChange={(event) => { setProfile(event.target.value); }}>{Object.values(BusinessProfileCatalog).map((item) => <option key={item.code} value={item.code}>{item.publicName}</option>)}<option value="OTHER">Outro</option></select></label>{profile === 'OTHER' && <label>Conte um pouco sobre o seu negócio<input value={customBusinessType} onChange={(event) => { setCustomBusinessType(event.target.value); }} placeholder="Ex.: Oficina mecânica" /></label>}<button className="primary-button" disabled={profile === 'OTHER' && customBusinessType.trim().length < 2} onClick={() => { updateOnboarding.mutate({ step: 'BUSINESS_IDENTITY', businessProfile: profile === 'OTHER' ? 'GENERIC' : profile, ...(profile === 'OTHER' ? { businessTypeCustom: customBusinessType.trim() } : {}) }); }}>Continuar</button></>}
          {onboarding.data.onboardingStep === 'BUSINESS_IDENTITY' && <><h2>Como seus clientes conhecem sua empresa?</h2><label>Nome a ser exibido<input value={businessName} onChange={(event) => { setBusinessName(event.target.value); }} placeholder={me.data.currentTenant.tenant.displayName} /></label><label>Endereço público<input value={suggestedSlug} readOnly aria-describedby="slug-help" /><small id="slug-help">{suggestedSlug.length < 2 ? 'Digite um nome para gerar o endereço.' : slugAvailability.isPending ? 'Verificando disponibilidade…' : slugAvailability.data?.available ? `Disponível: ${suggestedSlug}.agendei.site` : 'Este endereço já está em uso. Ajuste o nome.'}</small></label><button className="primary-button" disabled={businessName.trim().length < 2 || !slugAvailability.data?.available} onClick={() => { updateOnboarding.mutate({ step: 'CUSTOMIZE', displayName: businessName.trim(), slug: suggestedSlug }); }}>Continuar</button></>}
          {onboarding.data.onboardingStep === 'CUSTOMIZE' && <><h2>Agora vamos colocar sua marca</h2><p>Envie seu logo. Você pode continuar sem ele e usar o nome da empresa como identidade inicial.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) uploadBrandAsset.mutate({ kind: 'LOGO', file }); }} /><div className="button-row"><button className="primary-button" onClick={() => { updateOnboarding.mutate({ step: 'LAYOUT' }); }}>Continuar</button><button className="secondary-button" onClick={() => { updateOnboarding.mutate({ step: 'LAYOUT' }); }}>Continuar sem logo</button></div></>}
          {onboarding.data.onboardingStep === 'LAYOUT' && <><h2>Como você quer apresentar seu negócio?</h2><p>Escolha um modelo real já suportado pela página pública.</p><label>Layout<select value={publicTheme} onChange={(event) => { setPublicTheme(event.target.value); }}><option value="CLASSIC">Clássico</option><option value="MODERN">Moderno</option><option value="PREMIUM">Premium</option></select></label><button className="primary-button" onClick={() => { savePublicTheme.mutate(publicTheme, { onSuccess: () => { updateOnboarding.mutate({ step: 'COLORS' }); } }); }}>Continuar</button></>}
          {onboarding.data.onboardingStep === 'COLORS' && <><h2>Escolha as cores da sua empresa</h2><div className="brand-color-grid"><label>Cor principal<input type="color" value={primaryColor} onChange={(event) => { setPrimaryColor(event.target.value); }} /></label><label>Cor secundária<input type="color" value={secondaryColor} onChange={(event) => { setSecondaryColor(event.target.value); }} /></label><label>Cor de destaque<input type="color" value={accentColor} onChange={(event) => { setAccentColor(event.target.value); }} /></label></div><button className="primary-button" onClick={() => { saveBranding.mutate({ primaryColor, secondaryColor, accentColor }, { onSuccess: () => { updateOnboarding.mutate({ step: 'SPLASH' }); } }); }}>Continuar</button></>}
          {onboarding.data.onboardingStep === 'SPLASH' && <><h2>Como seu aplicativo deve aparecer ao abrir?</h2><p>A splash screen é exibida por alguns instantes enquanto o aplicativo PWA é iniciado.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) uploadBrandAsset.mutate({ kind: 'SPLASH', file }); }} /><div className="button-row"><button className="primary-button" onClick={() => { updateOnboarding.mutate({ step: 'APP_ICON' }); }}>Continuar</button><button className="secondary-button" onClick={() => { updateOnboarding.mutate({ step: 'APP_ICON' }); }}>Fazer depois</button></div></>}
          {onboarding.data.onboardingStep === 'APP_ICON' && <><h2>Escolha o ícone do seu aplicativo</h2><p>Esse ícone pode aparecer na tela inicial do celular na experiência PWA.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) uploadBrandAsset.mutate({ kind: 'APP_ICON', file }); }} /><div className="button-row"><button className="primary-button" onClick={() => { updateOnboarding.mutate({ step: 'READY' }); }}>Continuar</button><button className="secondary-button" onClick={() => { updateOnboarding.mutate({ step: 'READY' }); }}>Fazer depois</button></div></>}
          {onboarding.data.onboardingStep === 'READY' && <><h2>Ótimo! A identidade da sua empresa está pronta.</h2><p>Com isso já conseguimos montar a base da sua empresa. Agora vamos configurar o que você oferece aos seus clientes.</p><button className="primary-button" onClick={() => { updateOnboarding.mutate({ step: 'COMPLETE', completed: true }, { onSuccess: () => { void navigate('/app/servicos'); } }); }}>Criar meus serviços</button></>}
          {updateOnboarding.error instanceof Error && <p className="form-error">{updateOnboarding.error.message}</p>}
        </section>
      )}
      <nav className="app-navigation" aria-label="Navegação principal">
        <NavLink to="/app" end>Início</NavLink>
        {canReadAppointments && <NavLink to="/app/agenda">Agenda</NavLink>}
        {canReadCustomers && <NavLink to="/app/clientes">Clientes</NavLink>}
        {canReadServices && <NavLink to="/app/servicos">Serviços</NavLink>}
        {canReadProfessionals && <NavLink to="/app/profissionais">Equipe</NavLink>}
        {(canReadPayments || canReadCash) && <NavLink to="/app/financeiro">Financeiro</NavLink>}
        {canReadProducts && <NavLink to="/app/produtos">Produtos</NavLink>}
        {(canReadAutomations || canViewNotifications) && <NavLink to="/app/marketing">Marketing</NavLink>}
        {canUpdateTenantSettings && <NavLink to="/app/empresa">Minha empresa</NavLink>}
        {canViewSubscription && <NavLink to="/app/plano">Plano</NavLink>}
        {canUpdateTenantSettings && <NavLink to="/app/configuracoes">Configurações</NavLink>}
      </nav>
      <nav className="app-mobile-nav" aria-label="Navegação móvel">
        <NavLink to="/app" end>Início</NavLink>
        {canReadAppointments && <NavLink to="/app/agenda">Agenda</NavLink>}
        <button className="mobile-plus" aria-expanded={quickActionsOpen} onClick={() => { setQuickActionsOpen((open) => !open); }}>+</button>
        {canReadCustomers && <NavLink to="/app/clientes">Clientes</NavLink>}
        <button aria-expanded={mobileMenuOpen} onClick={() => { setMobileMenuOpen((open) => !open); }}>Menu</button>
      </nav>
      {quickActionsOpen && <div className="mobile-sheet" role="dialog" aria-label="Ações rápidas"><button onClick={() => { setQuickActionsOpen(false); void navigate('/app/agendamentos'); }}>Novo agendamento</button><button onClick={() => { setQuickActionsOpen(false); void navigate('/app/clientes'); }}>Novo cliente</button><button onClick={() => { setQuickActionsOpen(false); void navigate('/app/servicos'); }}>Novo serviço</button>{canSellProducts && <button onClick={() => { setQuickActionsOpen(false); void navigate('/app/produtos'); }}>Nova venda</button>}</div>}
      {mobileMenuOpen && <div className="mobile-sheet mobile-menu-sheet" role="dialog" aria-label="Mais opções"><NavLink to="/app/servicos" onClick={() => { setMobileMenuOpen(false); }}>Serviços</NavLink><NavLink to="/app/profissionais" onClick={() => { setMobileMenuOpen(false); }}>Equipe</NavLink><NavLink to="/app/financeiro" onClick={() => { setMobileMenuOpen(false); }}>Financeiro</NavLink><NavLink to="/app/produtos" onClick={() => { setMobileMenuOpen(false); }}>Produtos</NavLink><NavLink to="/app/marketing" onClick={() => { setMobileMenuOpen(false); }}>Marketing</NavLink><NavLink to="/app/empresa" onClick={() => { setMobileMenuOpen(false); }}>Minha empresa</NavLink><NavLink to="/app/plano" onClick={() => { setMobileMenuOpen(false); }}>Plano</NavLink><NavLink to="/app/configuracoes" onClick={() => { setMobileMenuOpen(false); }}>Configurações</NavLink></div>}
      <section className="session-grid">
        <article className="info-card">
          <span>Usuário</span>
          <strong>{me.data.user.email}</strong>
        </article>
        <article className="info-card">
          <span>Papel</span>
          <strong>{me.data.currentTenant?.membership.roleCode ?? 'Não selecionado'}</strong>
        </article>
        <article className="info-card">
          <span>API</span>
          <strong>
            {health.isSuccess ? 'Disponível' : health.isPending ? 'Verificando' : 'Indisponível'}
          </strong>
        </article>
      </section>
      {inArea('inicio') && onboardingChecklist.data !== undefined && !onboardingChecklist.data.hidden && <section className="onboarding-checklist" aria-labelledby="onboarding-checklist-title"><div><p className="eyebrow">Primeiros passos</p><h2 id="onboarding-checklist-title">{onboardingChecklist.data.items.filter((item) => item.complete).length} de {onboardingChecklist.data.items.length} concluídos</h2></div><button className="text-button" onClick={() => { updateOnboarding.mutate({ step: onboarding.data?.onboardingStep ?? 'COMPLETE', hideChecklist: true }); }}>Ocultar</button><ul>{onboardingChecklist.data.items.map((item) => <li key={item.key} className={item.complete ? 'complete' : undefined}>{item.complete ? '✓' : '○'} {({ company: 'Criar sua empresa', branding: 'Personalizar sua marca', service: 'Criar primeiro serviço', professional: 'Adicionar profissional', schedule: 'Definir horários', appointment: 'Testar primeiro agendamento', share: 'Compartilhar sua página' } as Record<string, string>)[item.key]}</li>)}</ul></section>}
      {me.data.tenants.length > 1 || me.data.currentTenant === null ? (
        <button className="text-button" onClick={() => void navigate('/select-tenant')}>
          {me.data.currentTenant === null ? 'Selecionar estabelecimento' : 'Trocar estabelecimento'}
        </button>
      ) : null}
      {selectedTenant !== undefined && me.data.currentTenant !== null && (
        <Suspense fallback={<p className="module-loading">Carregando área…</p>}>
          {inArea('inicio', 'empresa', 'configuracoes') && <TenantSettingsModule
            tenantPublicId={selectedTenant}
            canUpdate={canUpdateTenantSettings}
          />}
          {inArea('inicio', 'empresa') && <UnitsModule tenantPublicId={selectedTenant} canManage={canManageUnits} />}
          {inArea('inicio', 'empresa') && canReadUnits && <MultiUnitOverviewModule tenantPublicId={selectedTenant} />}
          {inArea('inicio', 'plano') && canViewSubscription && <TenantSubscriptionModule tenantPublicId={selectedTenant} />}
          {inArea('inicio') && canViewOperations && <OperationsDashboardModule tenantPublicId={selectedTenant} />}
          {inArea('inicio', 'financeiro') && canReadPayments && (
            <PaymentMethodsModule tenantPublicId={selectedTenant} canManage={canManagePayments} />
          )}
          {inArea('inicio', 'financeiro') && canReadCash && (
            <CashRegisterModule tenantPublicId={selectedTenant} canManage={canManageCash} />
          )}
          {inArea('inicio', 'financeiro') && canReadCommissions && <CommissionsModule tenantPublicId={selectedTenant} />}
          {inArea('inicio', 'clientes') && canReadCoupons && (
            <CouponsModule tenantPublicId={selectedTenant} canManage={canManageCoupons} />
          )}
          {inArea('inicio', 'clientes') && canReadLoyalty && (
            <LoyaltyModule tenantPublicId={selectedTenant} canManage={canManageLoyalty} />
          )}
          {inArea('inicio', 'produtos') && canReadProducts && (
            <ProductInventoryModule
              tenantPublicId={selectedTenant}
              canManage={canManageProducts}
              canSell={canSellProducts}
            />
          )}
          {inArea('financeiro') && canReadFinancialClosings && (
            <FinancialClosingModule
              tenantPublicId={selectedTenant}
              canManage={canManageFinancialClosings}
            />
          )}
          {inArea('financeiro') && canReadPayments && <DelinquencyModule tenantPublicId={selectedTenant} />}
          {inArea('financeiro') && canReadFinancialReports && <FinancialReportModule tenantPublicId={selectedTenant} />}
          {inArea('financeiro') && canReadPaymentGateway && (
            <PaymentOptionsModule
              tenantPublicId={selectedTenant}
              canManage={canManagePaymentGateway}
            />
          )}
          {inArea('financeiro') && canReadPaymentGateway && (
            <PaymentGatewayModule
              tenantPublicId={selectedTenant}
              canManage={canManagePaymentGateway}
            />
          )}
          {inArea('marketing') && canViewNotifications && <NotificationLogModule tenantPublicId={selectedTenant} />}
          {inArea('marketing') && canViewNotifications && (
            <NotificationTemplateModule
              tenantPublicId={selectedTenant}
              canManage={canManageNotificationTemplates}
            />
          )}
          {inArea('marketing') && canReadAutomations && (
            <CustomerRecoveryModule
              tenantPublicId={selectedTenant}
              canManage={canManageAutomations}
            />
          )}
          {inArea('profissionais') && canReadMembers && (
            <MembersModule tenantPublicId={selectedTenant} canManage={canManageMembers} />
          )}
          {inArea('inicio', 'agenda', 'agendamentos') && <CalendarModule tenantPublicId={selectedTenant} />}
          {inArea('agenda') && canViewOwnAgenda && <MyAgendaModule tenantPublicId={selectedTenant} />}
          {inArea('agenda') && canViewOwnAgenda && <MyAvailabilityModule tenantPublicId={selectedTenant} />}
          {inArea('profissionais') && canViewOwnAgenda && <MyCommissionsModule tenantPublicId={selectedTenant} />}
          {inArea('inicio', 'agenda', 'agendamentos') && <AppointmentModule
            tenantPublicId={selectedTenant}
            canFitIn={canFitIn}
            canCheckIn={canCheckIn}
            canReadPayments={canReadPayments}
            canManagePayments={canManagePayments}
          />}
          {inArea('agenda') && canViewWaitlist && <AppointmentWaitlistModule tenantPublicId={selectedTenant} />}
          {inArea('servicos') && <ServiceCategoryModule tenantPublicId={selectedTenant} />}
          {inArea('profissionais') && <ProfessionalModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.professional.singular ?? 'Profissional'}
          />}
          {inArea('clientes') && <CustomerModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.customer.singular ?? 'Cliente'}
          />}
          {inArea('servicos') && <ServiceModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.service.singular ?? 'Servi\u00e7o'}
          />}
          {inArea('servicos') && <ComboModule tenantPublicId={selectedTenant} />}
          {inArea('empresa') && <WhiteLabelModule tenantPublicId={selectedTenant} />}
          {inArea('empresa') && <TenantDomainModule tenantPublicId={selectedTenant} canManage={canManageBranding} />}
          {inArea('empresa') && canReadIntegrations && (
            <IntegrationsModule tenantPublicId={selectedTenant} canManage={canManageIntegrations} />
          )}
        </Suspense>
      )}
      {inArea('configuracoes') && <section className="sessions-panel" aria-labelledby="sessions-title">
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
      }
    </main>
  );
}
