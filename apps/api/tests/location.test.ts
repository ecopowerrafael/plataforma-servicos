import {
  BusinessUnitInputSchema,
  formatStructuredAddress,
  googleMapsDestination,
  googleMapsEmbed,
} from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { PrismaTenantRepository } from '../src/modules/tenants/prisma-tenant.repository.js';

const complete = {
  street: 'Rua das Acácias',
  number: '123',
  complement: null,
  district: 'Centro',
  city: 'Ibiúna',
  state: 'SP',
  postalCode: '18150-000',
  latitude: null,
  longitude: null,
  googleMapsUrl: null,
};

describe('business unit location', () => {
  it('formats a structured address without broken optional values', () => {
    expect(formatStructuredAddress(complete)).toEqual([
      'Rua das Acácias, 123',
      'Centro — Ibiúna/SP',
      'CEP 18150-000',
    ]);
    expect(formatStructuredAddress({ ...complete, complement: 'Sala 2' })[1]).toBe('Sala 2');
    expect(formatStructuredAddress({ street: null, city: null })).toEqual([]);
  });

  it.each([
    'https://www.google.com/maps/place/Teste',
    'https://maps.google.com/?q=teste',
    'https://maps.app.goo.gl/abc123',
  ])('accepts supported Google Maps URL %s', (googleMapsUrl) => {
    expect(
      BusinessUnitInputSchema.safeParse({ name: 'Matriz', slug: 'matriz', googleMapsUrl }).success,
    ).toBe(true);
  });

  it('rejects unsafe URLs and invalid or incomplete coordinates', () => {
    expect(
      BusinessUnitInputSchema.safeParse({
        name: 'Matriz',
        slug: 'matriz',
        googleMapsUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      BusinessUnitInputSchema.safeParse({
        name: 'Matriz',
        slug: 'matriz',
        googleMapsUrl: 'https://example.com/maps',
      }).success,
    ).toBe(false);
    expect(
      BusinessUnitInputSchema.safeParse({ name: 'Matriz', slug: 'matriz', latitude: -23.5 })
        .success,
    ).toBe(false);
    expect(
      BusinessUnitInputSchema.safeParse({
        name: 'Matriz',
        slug: 'matriz',
        latitude: -23.5,
        longitude: -47.2,
      }).success,
    ).toBe(true);
  });

  it('prioritizes exact URL, then coordinates, then a complete address', () => {
    const url = 'https://maps.app.goo.gl/abc123';
    expect(
      googleMapsDestination({ ...complete, googleMapsUrl: url, latitude: -23, longitude: -47 }),
    ).toBe(url);
    expect(googleMapsDestination({ ...complete, latitude: -23, longitude: -47 })).toContain(
      'query=-23,-47',
    );
    expect(googleMapsDestination(complete)).toContain('maps/search');
    expect(googleMapsDestination({ street: 'Rua', city: 'Cidade' })).toBeNull();
    expect(googleMapsEmbed({ street: 'Rua', city: 'Cidade' })).toBeNull();
  });

  it('persists the complete location on the selected business unit', async () => {
    const publicId = '55555555-5555-4555-8555-555555555555';
    const update = vi.fn().mockResolvedValue({
      publicId,
      name: 'Matriz',
      slug: 'matriz',
      status: 'ACTIVE',
      isHeadquarters: true,
      timezone: 'America/Sao_Paulo',
      countryCode: 'BR',
      ...complete,
      latitude: -23.65,
      longitude: -47.22,
      googleMapsUrl: 'https://maps.app.goo.gl/local',
    });
    const repository = new PrismaTenantRepository({
      businessUnit: { findFirst: vi.fn().mockResolvedValue({ id: 9n }), update },
    } as never);

    await repository.updateBusinessUnit(41n, publicId, 'America/Sao_Paulo', {
      name: 'Matriz',
      slug: 'matriz',
      countryCode: 'BR',
      street: 'Rua das Acácias',
      number: '123',
      district: 'Centro',
      city: 'Ibiúna',
      state: 'SP',
      postalCode: '18150-000',
      latitude: -23.65,
      longitude: -47.22,
      googleMapsUrl: 'https://maps.app.goo.gl/local',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9n },
        data: expect.objectContaining({
          street: 'Rua das Acácias',
          complement: null,
          latitude: -23.65,
          longitude: -47.22,
          googleMapsUrl: 'https://maps.app.goo.gl/local',
        }),
      }),
    );
  });
});
