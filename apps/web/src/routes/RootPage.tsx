import { PublicTenantResolutionResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

import { CommercialHomePage } from './CommercialHomePage.js';
import { httpClient } from '../lib/http.js';

export function RootPage() {
  const hostname = window.location.hostname.toLowerCase();
  const resolution = useQuery({
    queryKey: ['public-tenant-resolution', hostname],
    queryFn: () =>
      httpClient.request(`/public/tenant-resolution?hostname=${encodeURIComponent(hostname)}`, {
        schema: PublicTenantResolutionResponseSchema,
      }),
    retry: false,
  });
  if (resolution.isPending)
    return (
      <main className="app-shell">
        <p>Carregando…</p>
      </main>
    );
  return resolution.data === undefined ? (
    <CommercialHomePage />
  ) : (
    <Navigate to={`/public/${resolution.data.slug}`} replace />
  );
}
