import { PublicRegistrationRequestSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const request = {
  name: 'Studio Agendei',
  email: 'owner@example.com',
  password: 'SenhaSegura123!',
  planPublicId: '00000000-0000-4000-8000-000000000001',
  billingCycle: 'ANNUAL',
} as const;

describe('public registration contract', () => {
  it('preserva plano e periodicidade selecionados', () => {
    expect(PublicRegistrationRequestSchema.parse(request)).toMatchObject({
      planPublicId: request.planPublicId,
      billingCycle: 'ANNUAL',
    });
  });

  it('rejeita preço vindo do frontend', () => {
    expect(PublicRegistrationRequestSchema.safeParse({ ...request, priceCents: 1 })).toMatchObject({ success: false });
  });

  it('rejeita periodicidade fora das opções comerciais', () => {
    expect(PublicRegistrationRequestSchema.safeParse({ ...request, billingCycle: 'WEEKLY' })).toMatchObject({ success: false });
  });
});
