import {
  ChangePlanRequestSchema,
  CreateCommercialPlanRequestSchema,
  CreatePlatformTenantRequestSchema,
  CreateSubscriptionRequestSchema,
  ExtendTrialRequestSchema,
  PlanLimitInputSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const publicId = '11111111-1111-4111-8111-111111111111';
const isoDate = '2026-08-04T12:00:00.000Z';

describe('contratos comerciais da plataforma', () => {
  it('aceita plano comercial com limite tipado permitido', () => {
    expect(
      CreateCommercialPlanRequestSchema.safeParse({
        code: 'BASIC',
        name: 'Básico',
        billingCycle: 'MONTHLY',
        priceCents: 9900,
        currency: 'BRL',
        trialDays: 14,
        limits: [{ key: 'units.max', valueType: 'INTEGER', integerValue: 2 }],
      }).success,
    ).toBe(true);
  });

  it.each([
    { key: 'unknown.limit', valueType: 'INTEGER', integerValue: 1 },
    { key: 'units.max', valueType: 'BOOLEAN', integerValue: 1 },
    { key: 'units.max', valueType: 'INTEGER', integerValue: -1 },
    { key: 'custom_domain.enabled', valueType: 'INTEGER', integerValue: 1 },
    { key: 'units.max', valueType: 'INTEGER', integerValue: 1, booleanValue: true },
  ])('recusa limite inválido', (limit) => {
    expect(PlanLimitInputSchema.safeParse(limit).success).toBe(false);
  });

  it('aceita valores corretos para limites inteiros e booleanos', () => {
    expect(
      PlanLimitInputSchema.safeParse({ key: 'members.max', valueType: 'INTEGER', integerValue: 3 })
        .success,
    ).toBe(true);
    expect(
      PlanLimitInputSchema.safeParse({
        key: 'custom_domain.enabled',
        valueType: 'BOOLEAN',
        booleanValue: true,
      }).success,
    ).toBe(true);
  });

  it('aceita ilimitado apenas para chaves permitidas', () => {
    expect(
      PlanLimitInputSchema.safeParse({ key: 'units.max', valueType: 'INTEGER', integerValue: null })
        .success,
    ).toBe(true);
    expect(
      PlanLimitInputSchema.safeParse({
        key: 'storage.megabytes',
        valueType: 'INTEGER',
        integerValue: null,
      }).success,
    ).toBe(false);
  });

  it('recusa a mesma chave duas vezes no payload do plano', () => {
    expect(
      CreateCommercialPlanRequestSchema.safeParse({
        code: 'DUPLICATE_LIMIT',
        name: 'Plano com limite duplicado',
        billingCycle: 'MONTHLY',
        priceCents: 1000,
        limits: [
          { key: 'units.max', valueType: 'INTEGER', integerValue: 3 },
          { key: 'units.max', valueType: 'INTEGER', integerValue: 5 },
        ],
      }).success,
    ).toBe(false);
  });

  it('recusa preço comercial negativo', () => {
    expect(
      CreateCommercialPlanRequestSchema.safeParse({
        code: 'INVALID_PRICE',
        name: 'Preço inválido',
        billingCycle: 'MONTHLY',
        priceCents: -1,
      }).success,
    ).toBe(false);
  });

  it('valida provisionamento sem senha padrão e assinatura inicial', () => {
    const result = CreatePlatformTenantRequestSchema.safeParse({
      legalName: 'Empresa de Teste Ltda',
      displayName: 'Empresa de Teste',
      slug: 'empresa-de-teste',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      businessProfile: 'GENERIC',
      initialUnit: { name: 'Matriz', slug: 'matriz', countryCode: 'BR' },
      ownerEmail: 'owner@teste.invalid',
      planPublicId: publicId,
      trial: true,
      startsAt: isoDate,
    });
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('exige motivo e identificadores válidos para criação e alteração de assinatura', () => {
    expect(
      CreateSubscriptionRequestSchema.safeParse({
        planPublicId: publicId,
        trial: true,
        reason: 'Provisionamento comercial aprovado.',
      }).success,
    ).toBe(true);
    expect(
      ChangePlanRequestSchema.safeParse({ planPublicId: publicId, reason: 'ok' }).success,
    ).toBe(false);
  });

  it('exige data ISO e motivo para extensão de trial', () => {
    expect(
      ExtendTrialRequestSchema.safeParse({
        trialEndsAt: isoDate,
        reason: 'Extensão comercial aprovada.',
      }).success,
    ).toBe(true);
    expect(
      ExtendTrialRequestSchema.safeParse({ trialEndsAt: 'amanhã', reason: 'Extensão válida.' })
        .success,
    ).toBe(false);
  });
});
