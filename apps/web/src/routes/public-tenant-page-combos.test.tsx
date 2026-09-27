import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicTenantPage } from './PublicTenantPage.js';
import * as httpModule from '../lib/http.js';

vi.mock('../lib/http.js', () => ({
  httpClient: { request: vi.fn() },
  HttpError: class {},
}));

vi.mock('../components/public/PublicHeader.js', () => ({
  PublicHeader: () => <div data-testid="public-header" />,
}));

vi.mock('../components/public/PublicLocationSection.js', () => ({
  PublicLocationSection: () => <div data-testid="location-section" />,
}));

vi.mock('../components/public/PwaInstall.js', () => ({
  PwaInstall: () => null,
}));

vi.mock('../components/PublicBookingFlow.js', () => ({
  PublicBookingFlow: () => <div data-testid="booking-flow" />,
}));

vi.mock('../components/public/premium/PremiumApp.js', () => ({
  PremiumApp: () => null,
}));

vi.mock('../config/environment.js', () => ({
  environment: { apiUrl: 'http://localhost:3000' },
}));

vi.mock('../themes/classic/ClassicTheme.js', () => ({
  ClassicTheme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../themes/modern/ModernTheme.js', () => ({
  ModernTheme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../themes/premium/PremiumTheme.js', () => ({
  PremiumTheme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../themes/luxury/LuxuryTheme.js', () => ({
  LuxuryTheme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../themes/theme-fonts.js', () => ({
  useThemeFont: vi.fn(),
}));

vi.mock('../components/public/use-preview-override.js', () => ({
  usePreviewOverride: () => null,
}));

describe('PublicTenantPage — Combos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders combo with name, items, price, and duration', async () => {
    const mockHttpClient = httpModule.httpClient as any;
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/public/sites/')) {
        return Promise.resolve({
          publicId: 'tenant-123',
          slug: 'test-salon',
          displayName: 'Test Salon',
          businessProfile: 'BARBERSHOP',
          branding: {
            primaryColor: '#000',
            onPrimaryColor: null,
            headerColor: null,
            headerTextColor: null,
            navigationColor: null,
            activeColor: null,
            secondaryColor: '#000',
            accentColor: '#000',
            backgroundColor: '#fff',
            surfaceColor: '#fff',
            textColor: '#000',
            mutedTextColor: '#666',
            borderColor: '#ddd',
            borderRadius: '8px',
            fontFamily: 'Arial',
            logoUrl: null,
            faviconUrl: null,
            bannerUrl: null,
            pwaIconUrl: null,
            splashUrl: null,
          },
          terminology: {
            service: { singular: 'Serviço', plural: 'Serviços' },
            professional: { singular: 'Profissional', plural: 'Profissionais' },
            appointment: { singular: 'Agendamento', plural: 'Agendamentos' },
          },
          site: {
            theme: 'CLASSIC',
            layout: 'CLASSIC',
            heroTitle: 'Welcome',
            heroSubtitle: 'Book now',
            aboutText: 'About us',
            primaryCallToAction: 'Book',
            footerText: null,
            seoTitle: null,
            seoDescription: null,
            pwaName: 'Test',
            pwaShortName: 'Test',
            pwaDescription: null,
          },
          pwaPublished: false,
          assets: [],
          unit: null,
          units: [],
          services: [],
          professionals: [],
          combos: [
            {
              publicId: 'combo-1',
              name: 'Corte + Barba',
              description: 'Combo especial',
              imageUrl: null,
              imageAlt: null,
              priceCents: '12000',
              sortOrder: 1,
              durationMinutes: 45,
              items: [
                { name: 'Corte', servicePublicId: 'svc-1', sortOrder: 1, durationMinutes: 30, hasPostServiceBreak: false, postServiceBreakMinutes: 0 },
                { name: 'Barba', servicePublicId: 'svc-2', sortOrder: 2, durationMinutes: 15, hasPostServiceBreak: false, postServiceBreakMinutes: 0 },
              ],
            },
          ],
        });
      }
      if (url.includes('customer/me')) {
        return Promise.reject(new Error('Not authenticated'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <PublicTenantPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    // Wait for combo to render
    const comboTitle = await screen.findByText('Corte + Barba');
    expect(comboTitle).toBeDefined();

    // Check items are rendered
    expect(screen.getByText('Corte • Barba')).toBeDefined();

    // Check price is rendered (R$ 120,00)
    expect(screen.getByText('R$ 120,00')).toBeDefined();

    // Check duration is rendered
    expect(screen.getByText('45 min')).toBeDefined();

    // Check description is rendered
    expect(screen.getByText('Combo especial')).toBeDefined();

    // Check "Ver detalhes" CTA is NOT rendered
    expect(screen.queryByText('Ver detalhes')).toBeNull();

    // Check no #agendar link exists for combo
    const links = screen.queryAllByRole('link');
    const comboLinks = links.filter((link) => {
      const parent = link.closest('article');
      return parent?.querySelector('h3')?.textContent?.includes('Corte + Barba');
    });
    expect(comboLinks.every((link) => !link.getAttribute('href')?.includes('#agendar'))).toBe(true);
  });

  it('does not render combos section when combos array is empty', async () => {
    const mockHttpClient = httpModule.httpClient as any;
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/public/sites/')) {
        return Promise.resolve({
          publicId: 'tenant-456',
          slug: 'empty-salon',
          displayName: 'Empty Salon',
          businessProfile: 'BARBERSHOP',
          branding: {
            primaryColor: '#000',
            onPrimaryColor: null,
            headerColor: null,
            headerTextColor: null,
            navigationColor: null,
            activeColor: null,
            secondaryColor: '#000',
            accentColor: '#000',
            backgroundColor: '#fff',
            surfaceColor: '#fff',
            textColor: '#000',
            mutedTextColor: '#666',
            borderColor: '#ddd',
            borderRadius: '8px',
            fontFamily: 'Arial',
            logoUrl: null,
            faviconUrl: null,
            bannerUrl: null,
            pwaIconUrl: null,
            splashUrl: null,
          },
          terminology: {
            service: { singular: 'Serviço', plural: 'Serviços' },
            professional: { singular: 'Profissional', plural: 'Profissionais' },
            appointment: { singular: 'Agendamento', plural: 'Agendamentos' },
          },
          site: {
            theme: 'CLASSIC',
            layout: 'CLASSIC',
            heroTitle: 'Welcome',
            heroSubtitle: 'Book now',
            aboutText: 'About us',
            primaryCallToAction: 'Book',
            footerText: null,
            seoTitle: null,
            seoDescription: null,
            pwaName: 'Test',
            pwaShortName: 'Test',
            pwaDescription: null,
          },
          pwaPublished: false,
          assets: [],
          unit: null,
          units: [],
          services: [],
          professionals: [],
          combos: [],
        });
      }
      if (url.includes('customer/me')) {
        return Promise.reject(new Error('Not authenticated'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <PublicTenantPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    // Wait for page to load
    await screen.findByText('Empty Salon');

    // Combos section title should NOT be rendered
    const comboHeadings = screen.queryAllByText('Combos');
    expect(comboHeadings.length).toBe(0);
  });
});
