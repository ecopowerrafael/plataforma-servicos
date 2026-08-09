import { createBrowserRouter } from 'react-router-dom';

import { AcceptInvitationPage } from './routes/AcceptInvitationPage.js';
import { AccessDeniedPage } from './routes/AccessDeniedPage.js';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage.js';
import { LoginPage } from './routes/LoginPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { PlatformPageRebuild } from './routes/PlatformPageRebuild.js';
import { PublicTenantPage } from './routes/PublicTenantPage.js';
import { ResetPasswordPage } from './routes/ResetPasswordPage.js';
import { RootPage } from './routes/RootPage.js';
import { SelectTenantPage } from './routes/SelectTenantPage.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootPage />,
    errorElement: <NotFoundPage />,
  },
  { path: '/login', element: <LoginPage /> },
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
