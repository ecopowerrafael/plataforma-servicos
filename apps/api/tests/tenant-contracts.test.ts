import { CreateTenantRequestSchema, TenantSlugSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const validRequest = {
  legalName: 'Empresa Exemplo Ltda.',
  displayName: 'Empresa Exemplo',
  slug: 'empresa-exemplo',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
  currency: 'BRL',
  initialUnit: { name: 'Matriz', slug: 'matriz', countryCode: 'br' },
};

describe('contratos multiempresa', () => {
  it('normaliza slugs e aplica configurações padrão', () => {
    const result = CreateTenantRequestSchema.parse({ ...validRequest, slug: ' Empresa-Exemplo ' });

    expect(result.slug).toBe('empresa-exemplo');
    expect(result.initialUnit.countryCode).toBe('BR');
    expect(result.settings).toEqual({
      allowMultipleUnits: false,
      defaultAppointmentIntervalMinutes: 15,
      minimumAdvanceMinutes: 0,
      maximumAdvanceDays: 180,
      weekStartsOn: 'MONDAY',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24H',
    });
  });

  it.each(['admin', 'api', 'health', 'www'])('rejeita o slug reservado %s', (slug) => {
    expect(TenantSlugSchema.safeParse(slug).success).toBe(false);
  });

  it.each([
    { field: 'slug', value: 'empresa_1' },
    { field: 'timezone', value: 'UTC+3' },
    { field: 'locale', value: 'pt-br' },
    { field: 'currency', value: 'GBP' },
  ])('rejeita $field inválido', ({ field, value }) => {
    expect(CreateTenantRequestSchema.safeParse({ ...validRequest, [field]: value }).success).toBe(
      false,
    );
  });

  it('rejeita intervalo e seleção de tenant enviados pelo cliente', () => {
    const invalidInterval = {
      ...validRequest,
      settings: { defaultAppointmentIntervalMinutes: 25 },
    };
    expect(CreateTenantRequestSchema.safeParse(invalidInterval).success).toBe(false);
    expect(CreateTenantRequestSchema.safeParse({ ...validRequest, tenantId: 1 }).success).toBe(
      false,
    );
  });
});
