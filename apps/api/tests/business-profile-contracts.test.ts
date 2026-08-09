import {
  BusinessProfileCatalog,
  BusinessProfileCodeSchema,
  BusinessThemeSchema,
  CreatePlatformTenantRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

describe('catálogo de perfis de negócio', () => {
  it('mantém um catálogo para todos os perfis aceitos', () => {
    expect(Object.keys(BusinessProfileCatalog).sort()).toEqual(
      [...BusinessProfileCodeSchema.options].sort(),
    );
  });

  it('fornece fallback genérico com tema seguro', () => {
    const profile = BusinessProfileCatalog.GENERIC;
    expect(profile.terminology.customer.singular).toBe('Cliente');
    expect(BusinessThemeSchema.safeParse(profile.theme).success).toBe(true);
  });

  it('exige um perfil conhecido no provisionamento global', () => {
    const base = {
      legalName: 'Empresa de Teste Ltda',
      displayName: 'Empresa de Teste',
      slug: 'empresa-perfil',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      settings: {
        allowMultipleUnits: false,
        defaultAppointmentIntervalMinutes: 15,
        weekStartsOn: 'MONDAY',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24H',
      },
      initialUnit: { name: 'Matriz', slug: 'matriz' },
      ownerEmail: 'owner@teste.invalid',
      planPublicId: '11111111-1111-4111-8111-111111111111',
      trial: true,
    };
    expect(CreatePlatformTenantRequestSchema.safeParse(base).success).toBe(false);
    expect(
      CreatePlatformTenantRequestSchema.safeParse({
        ...base,
        businessProfile: 'PSYCHOLOGY',
      }).success,
    ).toBe(true);
  });
});
