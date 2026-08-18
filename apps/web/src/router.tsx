import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AcceptInvitationPage } from './routes/AcceptInvitationPage.js';
import { AccessDeniedPage } from './routes/AccessDeniedPage.js';
import { CustomerAccountPage } from './routes/CustomerAccountPage.js';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage.js';
import { HomePage } from './routes/HomePage.js';
import { LoginPage } from './routes/LoginPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { PlatformPageRebuild } from './routes/PlatformPageRebuild.js';
import { PublicTenantPage } from './routes/PublicTenantPage.js';
import { ProfessionalAppPage } from './routes/ProfessionalAppPage.js';
import { ProfessionalTenantLoginPage } from './routes/ProfessionalTenantLoginPage.js';
import { RegisterPage } from './routes/RegisterPage.js';
import { ResetPasswordPage } from './routes/ResetPasswordPage.js';
import { RootPage } from './routes/RootPage.js';
import { SelectTenantPage } from './routes/SelectTenantPage.js';

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
const SchedulingSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SchedulingSystemPage }));
const AISchedulingPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AISchedulingPage }));
const SalonSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonSystemPage }));
const SalonCRMPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonCRMPage }));
const BookingAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BookingAppPage }));
const WhatsAppBookingPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).WhatsAppBookingPage }));
const WhatsAppChatbotPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).WhatsAppChatbotPage }));
const VirtualAssistantPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).VirtualAssistantPage }));
const OnlineAgendaPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).OnlineAgendaPage }));
const OnlineSchedulingSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).OnlineSchedulingSystemPage }));
const WhatsAppReminderPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).WhatsAppReminderPage }));
const SalonAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonAppPage }));
const SalonOnlineAgendaPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonOnlineAgendaPage }));
const HairdresserAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).HairdresserAppPage }));
const HairdresserSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).HairdresserSystemPage }));
const SalonCommissionPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonCommissionPage }));
const SalonFinancePage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonFinancePage }));
const SalonLoyaltyPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonLoyaltyPage }));
const SalonVirtualReceptionistPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).SalonVirtualReceptionistPage }));
const ReduceNoShowsPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).ReduceNoShowsPage }));
const RecoverClientsPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).RecoverClientsPage }));
const FillCancelledSlotsPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).FillCancelledSlotsPage }));
const OrganizeSalonAgendaPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).OrganizeSalonAgendaPage }));
const ControlHairdresserCommissionPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).ControlHairdresserCommissionPage }));
const AutomateWhatsAppBookingPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AutomateWhatsAppBookingPage }));
const ClientRecoverySystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).ClientRecoverySystemPage }));
const FillCancelledSlotsSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).FillCancelledSlotsSystemPage }));
const BarberSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberSystemPage }));
const BarberAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberAppPage }));
const BarberCRMPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberCRMPage }));
const BarberAgendaPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberAgendaPage }));
const BarberAIPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberAIPage }));
const BarberWhatsAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberWhatsAppPage }));
const BarberFinancePage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberFinancePage }));
const BarberLoyaltyPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).BarberLoyaltyPage }));
const AestheticClinicSystemPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticClinicSystemPage })); const AestheticCRMPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticCRMPage })); const AestheticBookingPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticBookingPage })); const AestheticAppPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticAppPage })); const AestheticTreatmentsPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticTreatmentsPage })); const AestheticSessionsPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticSessionsPage })); const AestheticQuotePage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticQuotePage })); const AestheticReturnPage = lazy(async () => ({ default: (await import('./routes/SeoLandingPages.js')).AestheticReturnPage }));

function MarketingPageFallback() {
  return (
    <main className="marketing-page-loading">
      <span>Carregando página…</span>
    </main>
  );
}

function lazyPage(Page: typeof FeaturesPage) {
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
    errorElement: <NotFoundPage />,
  },
  { path: '/funcionalidades', element: lazyPage(FeaturesPage) },
  { path: '/planos', element: lazyPage(PricingPage) },
  { path: '/profissionais', element: lazyPage(ProfessionalPage) },
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
  { path: '/recepcionista-virtual-para-salao-de-beleza', element: lazyPage(SalonVirtualReceptionistPage) },
  { path: '/como-reduzir-faltas-no-salao', element: lazyPage(ReduceNoShowsPage) },
  { path: '/como-recuperar-clientes-de-salao', element: lazyPage(RecoverClientsPage) },
  { path: '/como-preencher-horarios-cancelados', element: lazyPage(FillCancelledSlotsPage) },
  { path: '/como-organizar-agenda-de-salao', element: lazyPage(OrganizeSalonAgendaPage) },
  { path: '/como-controlar-comissao-de-cabeleireiro', element: lazyPage(ControlHairdresserCommissionPage) },
  { path: '/como-automatizar-agendamento-pelo-whatsapp', element: lazyPage(AutomateWhatsAppBookingPage) },
  { path: '/sistema-para-recuperar-clientes', element: lazyPage(ClientRecoverySystemPage) },
  { path: '/sistema-para-preencher-horarios-cancelados', element: lazyPage(FillCancelledSlotsSystemPage) },
  { path: '/sistema-para-barbearia', element: lazyPage(BarberSystemPage) }, { path: '/aplicativo-para-barbearia', element: lazyPage(BarberAppPage) }, { path: '/crm-para-barbearia', element: lazyPage(BarberCRMPage) }, { path: '/agenda-online-para-barbearia', element: lazyPage(BarberAgendaPage) }, { path: '/ia-para-barbearia', element: lazyPage(BarberAIPage) }, { path: '/whatsapp-para-barbearia', element: lazyPage(BarberWhatsAppPage) }, { path: '/controle-financeiro-para-barbearia', element: lazyPage(BarberFinancePage) }, { path: '/programa-de-fidelidade-para-barbearia', element: lazyPage(BarberLoyaltyPage) },
  { path: '/sistema-para-clinica-de-estetica', element: lazyPage(AestheticClinicSystemPage) }, { path: '/crm-para-clinica-de-estetica', element: lazyPage(AestheticCRMPage) }, { path: '/agendamento-para-estetica', element: lazyPage(AestheticBookingPage) }, { path: '/aplicativo-para-estetica', element: lazyPage(AestheticAppPage) }, { path: '/sistema-para-tratamentos-esteticos', element: lazyPage(AestheticTreatmentsPage) }, { path: '/sistema-para-sessoes-de-estetica', element: lazyPage(AestheticSessionsPage) }, { path: '/orcamento-para-clinica-de-estetica', element: lazyPage(AestheticQuotePage) }, { path: '/controle-de-retorno-de-clientes', element: lazyPage(AestheticReturnPage) },
  { path: '/login', element: <LoginPage /> },
  { path: '/cadastro', element: <RegisterPage /> },
  { path: '/app', element: <HomePage /> },
  { path: '/public/:slug/profissional/login', element: <ProfessionalTenantLoginPage /> },
  { path: '/public/:slug/profissional', element: <ProfessionalAppPage /> },
  { path: '/public/:slug/profissional/comissoes', element: <ProfessionalAppPage section="commissions" /> },
  { path: '/public/:slug/profissional/perfil', element: <ProfessionalAppPage section="profile" /> },
  { path: '/app/agenda', element: <HomePage /> },
  { path: '/app/agenda/minha', element: <HomePage /> },
  { path: '/app/agenda/agendamentos', element: <HomePage /> },
  { path: '/app/agenda/disponibilidade', element: <HomePage /> },
  { path: '/app/agenda/lista-espera', element: <HomePage /> },
  { path: '/app/clientes', element: <HomePage /> },
  { path: '/app/clientes/:id', element: <HomePage /> },
  { path: '/app/clientes/recuperacao', element: <HomePage /> },
  { path: '/app/clientes/fidelidade', element: <HomePage /> },
  { path: '/app/clientes/cupons', element: <HomePage /> },
  { path: '/app/servicos', element: <HomePage /> },
  { path: '/app/servicos/novo', element: <HomePage /> },
  { path: '/app/servicos/:id', element: <HomePage /> },
  { path: '/app/servicos/categorias', element: <HomePage /> },
  { path: '/app/servicos/combos', element: <HomePage /> },
  { path: '/app/equipe/profissionais', element: <HomePage /> },
  { path: '/app/equipe/profissionais/:id', element: <HomePage /> },
  { path: '/app/equipe/membros', element: <HomePage /> },
  { path: '/app/equipe/comissoes', element: <HomePage /> },
  { path: '/app/financeiro', element: <HomePage /> },
  { path: '/app/financeiro/caixa', element: <HomePage /> },
  { path: '/app/financeiro/pagamentos', element: <HomePage /> },
  { path: '/app/financeiro/pendencias', element: <HomePage /> },
  { path: '/app/financeiro/fechamentos', element: <HomePage /> },
  { path: '/app/financeiro/relatorios', element: <HomePage /> },
  // A configuração de gateway foi unificada em /app/financeiro/opcoes.
  { path: '/app/financeiro/gateway', element: <Navigate replace to="/app/financeiro/opcoes" /> },
  { path: '/app/financeiro/opcoes', element: <HomePage /> },
  { path: '/app/produtos', element: <HomePage /> },
  { path: '/app/produtos/estoque', element: <HomePage /> },
  { path: '/app/produtos/movimentacoes', element: <HomePage /> },
  { path: '/app/produtos/:id', element: <HomePage /> },
  { path: '/app/marketing', element: <HomePage /> },
  { path: '/app/marketing/automacoes', element: <HomePage /> },
  { path: '/app/marketing/notificacoes', element: <HomePage /> },
  { path: '/app/marketing/modelos', element: <HomePage /> },
  { path: '/app/empresa', element: <HomePage /> },
  { path: '/app/empresa/dados', element: <HomePage /> },
  { path: '/app/empresa/marca', element: <HomePage /> },
  { path: '/app/empresa/banners', element: <HomePage /> },
  { path: '/app/empresa/pagina-publica', element: <HomePage /> },
  { path: '/app/empresa/aplicativo', element: <HomePage /> },
  { path: '/app/empresa/unidades', element: <HomePage /> },
  { path: '/app/empresa/dominio', element: <HomePage /> },
  { path: '/app/empresa/integracoes', element: <HomePage /> },
  { path: '/app/plano', element: <HomePage /> },
  { path: '/app/configuracoes', element: <HomePage /> },
  { path: '/app/configuracoes/sessoes', element: <HomePage /> },
  { path: '/select-tenant', element: <SelectTenantPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/accept-invitation', element: <AcceptInvitationPage /> },
  { path: '/access-denied', element: <AccessDeniedPage /> },
  { path: '/platform', element: <PlatformPageRebuild /> },
  { path: '/platform/plans/:resourceId', element: <PlatformPageRebuild /> },
  { path: '/platform/subscriptions/:resourceId', element: <PlatformPageRebuild /> },
  { path: '/platform/:section', element: <PlatformPageRebuild /> },
  { path: '/public/:slug', element: <PublicTenantPage /> },
  // Área do cliente em página inteira: uma URL por seção.
  { path: '/public/:slug/conta', element: <CustomerAccountPage /> },
  { path: '/public/:slug/conta/:section', element: <CustomerAccountPage /> },
  { path: '/public/:slug/conta/:section/:itemPublicId', element: <CustomerAccountPage /> },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
