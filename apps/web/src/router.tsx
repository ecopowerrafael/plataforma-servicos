import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AcceptInvitationPage } from './routes/AcceptInvitationPage.js';
import { AccessDeniedPage } from './routes/AccessDeniedPage.js';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage.js';
import { LoginPage } from './routes/LoginPage.js';
import { HomePage } from './routes/HomePage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { PlatformPageRebuild } from './routes/PlatformPageRebuild.js';
import { PublicTenantPage } from './routes/PublicTenantPage.js';
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
  { path: '/app', element: <HomePage /> },
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
