import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AcceptInvitationPage } from './routes/AcceptInvitationPage.js';
import { AccessDeniedPage } from './routes/AccessDeniedPage.js';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage.js';
import { HomePage } from './routes/HomePage.js';
import { LoginPage } from './routes/LoginPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { PlatformPageRebuild } from './routes/PlatformPageRebuild.js';
import { PublicTenantPage } from './routes/PublicTenantPage.js';
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
  { path: '/login', element: <LoginPage /> },
  { path: '/cadastro', element: <RegisterPage /> },
  { path: '/app', element: <HomePage /> },
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
  { path: '/app/financeiro/fechamentos', element: <HomePage /> },
  { path: '/app/financeiro/relatorios', element: <HomePage /> },
  { path: '/app/financeiro/gateway', element: <HomePage /> },
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
  { path: '/public/:slug', element: <PublicTenantPage /> },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
