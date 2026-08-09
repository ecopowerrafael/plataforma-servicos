import {
  BusinessProfileCatalog,
  CreateTenantCustomFieldRequestSchema,
  UpdateTenantCustomFieldRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

describe('definições de campos configuráveis', () => {
  it('mantém defaults por perfil e fallback GENERIC', () => {
    expect(
      BusinessProfileCatalog.PSYCHOLOGY.recommendedCustomFields.map((field) => field.key),
    ).toContain('crp');
    expect(BusinessProfileCatalog.GENERIC.recommendedCustomFields).toEqual([]);
  });

  it('aceita apenas opções válidas para listas', () => {
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'modalidade',
        label: 'Modalidade',
        type: 'SELECT',
        scope: 'APPOINTMENT',
        options: ['Online', 'Presencial'],
      }).success,
    ).toBe(true);
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'modalidade',
        label: 'Modalidade',
        type: 'SELECT',
        scope: 'APPOINTMENT',
      }).success,
    ).toBe(false);
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'nota',
        label: 'Nota',
        type: 'TEXT',
        scope: 'CUSTOMER',
        options: ['A'],
      }).success,
    ).toBe(false);
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'modalidade',
        label: 'Modalidade',
        type: 'SELECT',
        scope: 'APPOINTMENT',
        options: ['Online', 'online'],
      }).success,
    ).toBe(false);
  });

  it('rejeita chave, tipo e validação insegura', () => {
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'crp<script>',
        label: 'CRP',
        type: 'TEXT',
        scope: 'PROFESSIONAL',
      }).success,
    ).toBe(false);
    expect(
      CreateTenantCustomFieldRequestSchema.safeParse({
        key: 'crp',
        label: 'CRP',
        type: 'SCRIPT',
        scope: 'PROFESSIONAL',
      }).success,
    ).toBe(false);
    expect(
      UpdateTenantCustomFieldRequestSchema.safeParse({ validation: { regex: '.*' } }).success,
    ).toBe(false);
  });
});
