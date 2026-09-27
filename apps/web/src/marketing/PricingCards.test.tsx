import { CommercialPlanPublicSchema } from '@plataforma/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PricingCards } from './PricingCards.js';

const benefit = (text: string, sortOrder: number, enabled = true) => ({
  publicId: `00000000-0000-4000-8000-00000000${String(sortOrder).padStart(4, '0')}`,
  text,
  sortOrder,
  enabled,
});

const plan = (overrides: Record<string, unknown> = {}) =>
  CommercialPlanPublicSchema.parse({
    publicId: '00000000-0000-4000-8000-0000000000a1',
    code: 'PROFESSIONAL',
    name: 'Professional',
    subtitle: null,
    shortDescription: null,
    description: null,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    priceCents: '9990',
    monthlyPriceCents: '9990',
    annualPriceCents: null,
    billingOptions: [],
    currency: 'BRL',
    trialDays: 7,
    isPublic: true,
    highlighted: false,
    badge: null,
    ctaText: 'Começar agora',
    sortOrder: 0,
    // Features reais do plano: continuam existindo e não podem virar texto.
    limits: [
      { key: 'whatsapp.enabled', valueType: 'BOOLEAN', integerValue: null, booleanValue: true, stringValue: null },
      { key: 'professionals.max', valueType: 'INTEGER', integerValue: '5', booleanValue: null, stringValue: null },
    ],
    benefits: [
      benefit('CRM de clientes', 2),
      benefit('Agenda online completa', 1),
      benefit('Item oculto', 3, false),
    ],
    createdAt: '2026-08-17T12:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
    ...overrides,
  });

function render(plans: ReturnType<typeof plan>[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PricingCards plans={plans} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('card comercial do plano', () => {
  it('mostra somente os itens comerciais cadastrados', () => {
    const html = render([plan()]);
    expect(html).toContain('Agenda online completa');
    expect(html).toContain('CRM de clientes');
    expect(html).toContain('Começar agora');
  });

  it('respeita o sortOrder definido pelo Super Admin', () => {
    const html = render([plan()]);
    expect(html.indexOf('Agenda online completa')).toBeLessThan(html.indexOf('CRM de clientes'));
  });

  it('não deriva benefícios das features do plano', () => {
    const html = render([plan()]);
    // Rótulos técnicos dos limites não aparecem mais no card.
    expect(html).not.toContain('WhatsApp');
    expect(html).not.toContain('Profissionais');
    expect(html).not.toContain('Incluído');
  });

  it('não exibe item desativado', () => {
    const html = render([plan()]);
    expect(html).not.toContain('Item oculto');
  });

  it('plano sem itens comerciais continua renderizando o card', () => {
    const html = render([plan({ benefits: [] })]);
    expect(html).toContain('Professional');
    expect(html).toContain('Começar agora');
    expect(html).not.toContain('pricing-benefits');
  });
});
