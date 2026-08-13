import { TenantWhiteLabelResponseSchema } from '@plataforma/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { WhiteLabelModule } from './WhiteLabelModule.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const baseResponse = TenantWhiteLabelResponseSchema.parse({
  slug: 'barbearia-silva',
  displayName: 'Barbearia Silva',
  businessProfile: 'BARBERSHOP',
  branding: {
    useProfileDefaults: true,
    primaryColor: '#2563EB',
    secondaryColor: '#1E40AF',
    accentColor: '#F59E0B',
    backgroundColor: '#F8FAFC',
    surfaceColor: '#FFFFFF',
    textColor: '#0F172A',
    mutedTextColor: '#475569',
    borderColor: '#CBD5E1',
    borderRadius: '0.75rem',
    fontFamily: 'system-ui',
    logoUrl: null,
    faviconUrl: null,
    bannerUrl: null,
    pwaIconUrl: null,
    splashUrl: null,
  },
  site: {
    theme: 'CLASSIC',
    layout: 'CLASSIC',
    heroTitle: null,
    heroSubtitle: null,
    aboutText: null,
    primaryCallToAction: null,
    footerText: null,
    seoTitle: null,
    seoDescription: null,
    pwaName: null,
    pwaShortName: null,
    pwaDescription: null,
  },
  assets: [],
});

function renderBrandStudio(response: typeof baseResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['tenant', tenantPublicId, 'white-label'], response);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        null,
        createElement(WhiteLabelModule, { tenantPublicId }),
      ),
    ),
  );
}

describe('WhiteLabelModule complete states', () => {
  it.each([
    ['branding completo', baseResponse],
    ['tenant legado sem branding persistido', { ...baseResponse, branding: { ...baseResponse.branding, useProfileDefaults: true } }],
    ['publicSite originalmente null', { ...baseResponse, site: { ...baseResponse.site, theme: 'CLASSIC' as const } }],
    ['mídia vazia', { ...baseResponse, assets: [] }],
    ['terminology ausente', baseResponse],
    ['campo opcional null', { ...baseResponse, site: { ...baseResponse.site, pwaShortName: null } }],
  ])('renders without crashing for %s', (_name, response) => {
    const markup = renderBrandStudio(response);
    expect(markup).toContain('Brand Studio');
    expect(markup).toContain('Barbearia Silva');
    expect(markup).not.toContain('Não foi possível carregar o Brand Studio.');
  });
});
