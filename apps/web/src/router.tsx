import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RootPage } from './routes/RootPage.js';

const AcceptInvitationPage = lazy(async () => ({
  default: (await import('./routes/AcceptInvitationPage.js')).AcceptInvitationPage,
}));
const AccessDeniedPage = lazy(async () => ({
  default: (await import('./routes/AccessDeniedPage.js')).AccessDeniedPage,
}));
const CustomerAccountPage = lazy(async () => ({
  default: (await import('./routes/CustomerAccountPage.js')).CustomerAccountPage,
}));
const ForgotPasswordPage = lazy(async () => ({
  default: (await import('./routes/ForgotPasswordPage.js')).ForgotPasswordPage,
}));
const HomePage = lazy(async () => ({ default: (await import('./routes/HomePage.js')).HomePage }));
const LoginPage = lazy(async () => ({
  default: (await import('./routes/LoginPage.js')).LoginPage,
}));
const NotFoundPage = lazy(async () => ({
  default: (await import('./routes/NotFoundPage.js')).NotFoundPage,
}));
const PlatformPageRebuild = lazy(async () => ({
  default: (await import('./routes/PlatformPageRebuild.js')).PlatformPageRebuild,
}));
const PlatformProfessionalDetailPage = lazy(async () => ({
  default: (await import('./routes/PlatformProfessionalDetailPage.js')).PlatformProfessionalDetailPage,
}));
const PlatformServiceDetailPage = lazy(async () => ({
  default: (await import('./routes/PlatformServiceDetailPage.js')).PlatformServiceDetailPage,
}));
const PlatformComboDetailPage = lazy(async () => ({
  default: (await import('./routes/PlatformComboDetailPage.js')).PlatformComboDetailPage,
}));
const PublicTenantPage = lazy(async () => ({
  default: (await import('./routes/PublicTenantPage.js')).PublicTenantPage,
}));
const ProfessionalAppPage = lazy(async () => ({
  default: (await import('./routes/ProfessionalAppPage.js')).ProfessionalAppPage,
}));
const ProfessionalTenantLoginPage = lazy(async () => ({
  default: (await import('./routes/ProfessionalTenantLoginPage.js')).ProfessionalTenantLoginPage,
}));
const RegisterPage = lazy(async () => ({
  default: (await import('./routes/RegisterPage.js')).RegisterPage,
}));
const ResetPasswordPage = lazy(async () => ({
  default: (await import('./routes/ResetPasswordPage.js')).ResetPasswordPage,
}));
const SelectTenantPage = lazy(async () => ({
  default: (await import('./routes/SelectTenantPage.js')).SelectTenantPage,
}));
const DirectoryHomePage = lazy(async () => ({
  default: (await import('./routes/DirectoryPages.js')).DirectoryHomePage,
}));
const DirectoryCategoryPage = lazy(async () => ({
  default: (await import('./routes/DirectoryPages.js')).DirectoryCategoryPage,
}));
const DirectoryCityPage = lazy(async () => ({
  default: (await import('./routes/DirectoryPages.js')).DirectoryCityPage,
}));
const DirectoryBusinessPage = lazy(async () => ({
  default: (await import('./routes/DirectoryPages.js')).DirectoryBusinessPage,
}));
const PrivacyPage = lazy(async () => ({
  default: (await import('./routes/LegalPages.js')).PrivacyPage,
}));
const TermsPage = lazy(async () => ({
  default: (await import('./routes/LegalPages.js')).TermsPage,
}));

const FeaturesPage = lazy(async () => {
  const module = await import('./routes/FeaturesPage.js');
  return { default: module.FeaturesPage };
});
const PricingPage = lazy(async () => {
  const module = await import('./routes/PricingPage.js');
  return { default: module.PricingPage };
});
const ProfessionalPage = lazy(async () => {
  const module = await import('./routes/ProfessionalPage.js');
  return { default: module.ProfessionalPage };
});
const SchedulingSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SchedulingSystemPage,
}));
const AISchedulingPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AISchedulingPage,
}));
const SalonSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonSystemPage,
}));
const SalonCRMPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonCRMPage,
}));
const BookingAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BookingAppPage,
}));
const WhatsAppBookingPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).WhatsAppBookingPage,
}));
const WhatsAppChatbotPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).WhatsAppChatbotPage,
}));
const VirtualAssistantPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).VirtualAssistantPage,
}));
const OnlineAgendaPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).OnlineAgendaPage,
}));
const OnlineSchedulingSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).OnlineSchedulingSystemPage,
}));
const WhatsAppReminderPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).WhatsAppReminderPage,
}));
const SalonAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonAppPage,
}));
const SalonOnlineAgendaPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonOnlineAgendaPage,
}));
const HairdresserAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).HairdresserAppPage,
}));
const HairdresserSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).HairdresserSystemPage,
}));
const SalonCommissionPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonCommissionPage,
}));
const SalonFinancePage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonFinancePage,
}));
const SalonLoyaltyPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonLoyaltyPage,
}));
const SalonVirtualReceptionistPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).SalonVirtualReceptionistPage,
}));
const ReduceNoShowsPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).ReduceNoShowsPage,
}));
const RecoverClientsPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).RecoverClientsPage,
}));
const FillCancelledSlotsPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).FillCancelledSlotsPage,
}));
const OrganizeSalonAgendaPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).OrganizeSalonAgendaPage,
}));
const ControlHairdresserCommissionPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).ControlHairdresserCommissionPage,
}));
const AutomateWhatsAppBookingPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AutomateWhatsAppBookingPage,
}));
const ClientRecoverySystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).ClientRecoverySystemPage,
}));
const FillCancelledSlotsSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).FillCancelledSlotsSystemPage,
}));
const BarberSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberSystemPage,
}));
const BarberAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberAppPage,
}));
const BarberCRMPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberCRMPage,
}));
const BarberAgendaPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberAgendaPage,
}));
const BarberAIPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberAIPage,
}));
const BarberWhatsAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberWhatsAppPage,
}));
const BarberFinancePage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberFinancePage,
}));
const BarberLoyaltyPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).BarberLoyaltyPage,
}));
const AestheticClinicSystemPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticClinicSystemPage,
}));
const AestheticCRMPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticCRMPage,
}));
const AestheticBookingPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticBookingPage,
}));
const AestheticAppPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticAppPage,
}));
const AestheticTreatmentsPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticTreatmentsPage,
}));
const AestheticSessionsPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticSessionsPage,
}));
const AestheticQuotePage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticQuotePage,
}));
const AestheticReturnPage = lazy(async () => ({
  default: (await import('./routes/SeoLandingPages.js')).AestheticReturnPage,
}));

function MarketingPageFallback() {
  return (
    <main className="marketing-page-loading">
      <span>Carregando página…</span>
    </main>
  );
}

function lazyPage(Page: ComponentType) {
  return (
    <Suspense fallback={<MarketingPageFallback />}>
      <Page />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootPage />,
    errorElement: lazyPage(NotFoundPage),
  },
  { path: '/funcionalidades', element: lazyPage(FeaturesPage) },
  { path: '/planos', element: lazyPage(PricingPage) },
  { path: '/profissionais', element: lazyPage(ProfessionalPage) },
  { path: '/privacidade', element: lazyPage(PrivacyPage) },
  { path: '/politica-de-privacidade', element: lazyPage(PrivacyPage) },
  { path: '/termos', element: lazyPage(TermsPage) },
  { path: '/termos-de-uso', element: lazyPage(TermsPage) },
  { path: '/encontre', element: lazyPage(DirectoryHomePage) },
  { path: '/encontre/:categorySlug', element: lazyPage(DirectoryCategoryPage) },
  { path: '/encontre/:categorySlug/:citySlug', element: lazyPage(DirectoryCityPage) },
  {
    path: '/encontre/:categorySlug/:citySlug/:businessSlug',
    element: lazyPage(DirectoryBusinessPage),
  },
  { path: '/sistema-de-agendamento', element: lazyPage(SchedulingSystemPage) },
  { path: '/ia-para-agendamento', element: lazyPage(AISchedulingPage) },
  { path: '/sistema-para-salao-de-beleza', element: lazyPage(SalonSystemPage) },
  { path: '/crm-para-salao-de-beleza', element: lazyPage(SalonCRMPage) },
  { path: '/aplicativo-de-agendamento', element: lazyPage(BookingAppPage) },
  { path: '/agendamento-pelo-whatsapp', element: lazyPage(WhatsAppBookingPage) },
  { path: '/chatbot-whatsapp-para-agendamento', element: lazyPage(WhatsAppChatbotPage) },
  { path: '/assistente-virtual-para-agendamento', element: lazyPage(VirtualAssistantPage) },
  { path: '/agenda-online', element: lazyPage(OnlineAgendaPage) },
  { path: '/sistema-de-agendamento-online', element: lazyPage(OnlineSchedulingSystemPage) },
  { path: '/lembrete-de-agendamento-whatsapp', element: lazyPage(WhatsAppReminderPage) },
  { path: '/aplicativo-para-salao-de-beleza', element: lazyPage(SalonAppPage) },
  { path: '/agenda-online-para-salao-de-beleza', element: lazyPage(SalonOnlineAgendaPage) },
  { path: '/aplicativo-para-cabeleireiro', element: lazyPage(HairdresserAppPage) },
  { path: '/sistema-de-agendamento-para-cabeleireiro', element: lazyPage(HairdresserSystemPage) },
  { path: '/sistema-de-comissao-para-salao', element: lazyPage(SalonCommissionPage) },
  { path: '/controle-financeiro-para-salao-de-beleza', element: lazyPage(SalonFinancePage) },
  { path: '/programa-de-fidelidade-para-salao-de-beleza', element: lazyPage(SalonLoyaltyPage) },
  {
    path: '/recepcionista-virtual-para-salao-de-beleza',
    element: lazyPage(SalonVirtualReceptionistPage),
  },
  { path: '/como-reduzir-faltas-no-salao', element: lazyPage(ReduceNoShowsPage) },
  { path: '/como-recuperar-clientes-de-salao', element: lazyPage(RecoverClientsPage) },
  { path: '/como-preencher-horarios-cancelados', element: lazyPage(FillCancelledSlotsPage) },
  { path: '/como-organizar-agenda-de-salao', element: lazyPage(OrganizeSalonAgendaPage) },
  {
    path: '/como-controlar-comissao-de-cabeleireiro',
    element: lazyPage(ControlHairdresserCommissionPage),
  },
  {
    path: '/como-automatizar-agendamento-pelo-whatsapp',
    element: lazyPage(AutomateWhatsAppBookingPage),
  },
  { path: '/sistema-para-recuperar-clientes', element: lazyPage(ClientRecoverySystemPage) },
  {
    path: '/sistema-para-preencher-horarios-cancelados',
    element: lazyPage(FillCancelledSlotsSystemPage),
  },
  { path: '/sistema-para-barbearia', element: lazyPage(BarberSystemPage) },
  { path: '/aplicativo-para-barbearia', element: lazyPage(BarberAppPage) },
  { path: '/crm-para-barbearia', element: lazyPage(BarberCRMPage) },
  { path: '/agenda-online-para-barbearia', element: lazyPage(BarberAgendaPage) },
  { path: '/ia-para-barbearia', element: lazyPage(BarberAIPage) },
  { path: '/whatsapp-para-barbearia', element: lazyPage(BarberWhatsAppPage) },
  { path: '/controle-financeiro-para-barbearia', element: lazyPage(BarberFinancePage) },
  { path: '/programa-de-fidelidade-para-barbearia', element: lazyPage(BarberLoyaltyPage) },
  { path: '/sistema-para-clinica-de-estetica', element: lazyPage(AestheticClinicSystemPage) },
  { path: '/crm-para-clinica-de-estetica', element: lazyPage(AestheticCRMPage) },
  { path: '/agendamento-para-estetica', element: lazyPage(AestheticBookingPage) },
  { path: '/aplicativo-para-estetica', element: lazyPage(AestheticAppPage) },
  { path: '/sistema-para-tratamentos-esteticos', element: lazyPage(AestheticTreatmentsPage) },
  { path: '/sistema-para-sessoes-de-estetica', element: lazyPage(AestheticSessionsPage) },
  { path: '/orcamento-para-clinica-de-estetica', element: lazyPage(AestheticQuotePage) },
  { path: '/controle-de-retorno-de-clientes', element: lazyPage(AestheticReturnPage) },
  { path: '/login', element: lazyPage(LoginPage) },
  { path: '/cadastro', element: lazyPage(RegisterPage) },
  { path: '/app', element: lazyPage(HomePage) },
  { path: '/public/:slug/profissional/login', element: lazyPage(ProfessionalTenantLoginPage) },
  { path: '/public/:slug/profissional', element: lazyPage(ProfessionalAppPage) },
  {
    path: '/public/:slug/profissional/comissoes',
    element: lazyPage(() => <ProfessionalAppPage section="commissions" />),
  },
  {
    path: '/public/:slug/profissional/perfil',
    element: lazyPage(() => <ProfessionalAppPage section="profile" />),
  },
  { path: '/app/agenda', element: lazyPage(HomePage) },
  { path: '/app/agenda/minha', element: lazyPage(HomePage) },
  { path: '/app/agenda/agendamentos', element: lazyPage(HomePage) },
  { path: '/app/agenda/disponibilidade', element: lazyPage(HomePage) },
  { path: '/app/agenda/lista-espera', element: lazyPage(HomePage) },
  { path: '/app/clientes', element: lazyPage(HomePage) },
  { path: '/app/clientes/:id', element: lazyPage(HomePage) },
  { path: '/app/clientes/recuperacao', element: lazyPage(HomePage) },
  { path: '/app/clientes/fidelidade', element: lazyPage(HomePage) },
  { path: '/app/clientes/cupons', element: lazyPage(HomePage) },
  { path: '/app/assinaturas', element: lazyPage(HomePage) },
  { path: '/app/assinaturas/planos', element: lazyPage(HomePage) },
  { path: '/app/assinaturas/assinantes', element: lazyPage(HomePage) },
  { path: '/app/assinaturas/consumo', element: lazyPage(HomePage) },
  { path: '/app/servicos', element: lazyPage(HomePage) },
  { path: '/app/servicos/novo', element: lazyPage(HomePage) },
  { path: '/app/servicos/:id', element: lazyPage(HomePage) },
  { path: '/app/servicos/categorias', element: lazyPage(HomePage) },
  { path: '/app/servicos/combos', element: lazyPage(HomePage) },
  { path: '/app/equipe/profissionais', element: lazyPage(HomePage) },
  { path: '/app/equipe/profissionais/:id', element: lazyPage(HomePage) },
  { path: '/app/equipe/membros', element: lazyPage(HomePage) },
  { path: '/app/equipe/comissoes', element: lazyPage(HomePage) },
  { path: '/app/financeiro', element: lazyPage(HomePage) },
  { path: '/app/financeiro/caixa', element: lazyPage(HomePage) },
  { path: '/app/financeiro/pagamentos', element: lazyPage(HomePage) },
  { path: '/app/financeiro/pendencias', element: lazyPage(HomePage) },
  { path: '/app/financeiro/fechamentos', element: lazyPage(HomePage) },
  { path: '/app/financeiro/relatorios', element: lazyPage(HomePage) },
  // A configuração de gateway foi unificada em /app/financeiro/opcoes.
  { path: '/app/financeiro/gateway', element: <Navigate replace to="/app/financeiro/opcoes" /> },
  { path: '/app/financeiro/opcoes', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/cobrancas', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/nova', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/campanhas', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/promessas', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/atendimento', element: lazyPage(HomePage) },
  { path: '/app/bot-cobra/configuracoes', element: lazyPage(HomePage) },
  { path: '/app/produtos', element: lazyPage(HomePage) },
  { path: '/app/produtos/estoque', element: lazyPage(HomePage) },
  { path: '/app/produtos/movimentacoes', element: lazyPage(HomePage) },
  { path: '/app/produtos/:id', element: lazyPage(HomePage) },
  { path: '/app/marketing', element: lazyPage(HomePage) },
  { path: '/app/marketing/automacoes', element: lazyPage(HomePage) },
  { path: '/app/marketing/notificacoes', element: lazyPage(HomePage) },
  { path: '/app/marketing/modelos', element: lazyPage(HomePage) },
  { path: '/app/empresa', element: lazyPage(HomePage) },
  { path: '/app/empresa/dados', element: lazyPage(HomePage) },
  { path: '/app/empresa/marca', element: lazyPage(HomePage) },
  { path: '/app/empresa/banners', element: lazyPage(HomePage) },
  { path: '/app/empresa/pagina-publica', element: lazyPage(HomePage) },
  { path: '/app/empresa/aplicativo', element: lazyPage(HomePage) },
  { path: '/app/empresa/unidades', element: lazyPage(HomePage) },
  { path: '/app/empresa/dominio', element: lazyPage(HomePage) },
  { path: '/app/empresa/integracoes', element: lazyPage(HomePage) },
  { path: '/app/plano', element: lazyPage(HomePage) },
  { path: '/app/whatsapp', element: lazyPage(HomePage) },
  { path: '/app/configuracoes', element: lazyPage(HomePage) },
  { path: '/app/configuracoes/sessoes', element: lazyPage(HomePage) },
  { path: '/app/configuracoes/emails', element: lazyPage(HomePage) },
  { path: '/select-tenant', element: lazyPage(SelectTenantPage) },
  { path: '/forgot-password', element: lazyPage(ForgotPasswordPage) },
  { path: '/reset-password', element: lazyPage(ResetPasswordPage) },
  { path: '/accept-invitation', element: lazyPage(AcceptInvitationPage) },
  { path: '/access-denied', element: lazyPage(AccessDeniedPage) },
  {
    path: '/platform',
    element: lazyPage(PlatformPageRebuild),
    children: [
      {
        path: 'tenants/:tenantPublicId/professionals/:professionalPublicId',
        element: lazyPage(PlatformProfessionalDetailPage),
      },
      {
        path: 'tenants/:tenantPublicId/services/:servicePublicId',
        element: lazyPage(PlatformServiceDetailPage),
      },
      {
        path: 'tenants/:tenantPublicId/combos/:comboPublicId',
        element: lazyPage(PlatformComboDetailPage),
      },
    ],
  },
  { path: '/platform/plans/:resourceId', element: lazyPage(PlatformPageRebuild) },
  { path: '/platform/subscriptions/:resourceId', element: lazyPage(PlatformPageRebuild) },
  { path: '/platform/tenants/:resourceId', element: lazyPage(PlatformPageRebuild) },
  { path: '/platform/:section', element: lazyPage(PlatformPageRebuild) },
  { path: '/public/:slug', element: lazyPage(PublicTenantPage) },
  // Área do cliente em página inteira: uma URL por seção.
  { path: '/public/:slug/conta', element: lazyPage(CustomerAccountPage) },
  { path: '/public/:slug/conta/:section', element: lazyPage(CustomerAccountPage) },
  { path: '/public/:slug/conta/:section/:itemPublicId', element: lazyPage(CustomerAccountPage) },
  {
    path: '*',
    element: lazyPage(NotFoundPage),
  },
]);
