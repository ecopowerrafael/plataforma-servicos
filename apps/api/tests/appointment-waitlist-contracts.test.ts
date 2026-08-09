import {
  CreateAppointmentWaitlistRequestSchema,
  ConvertAppointmentWaitlistRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const valid = {
  customerPublicId: '11111111-1111-4111-8111-111111111111',
  professionalPublicId: null,
  servicePublicId: '22222222-2222-4222-8222-222222222222',
  unitPublicId: '33333333-3333-4333-8333-333333333333',
  preferredDateFrom: '2026-08-10',
  preferredDateTo: '2026-08-12',
  preferredTimeStart: '09:00',
  preferredTimeEnd: '12:00',
  expiresAt: '2026-08-13T00:00:00.000Z',
};

describe('contratos da lista de espera', () => {
  it('aceita qualquer profissional e uma faixa válida', () => {
    expect(CreateAppointmentWaitlistRequestSchema.safeParse(valid).success).toBe(true);
  });
  it('rejeita faixa de datas invertida', () => {
    expect(
      CreateAppointmentWaitlistRequestSchema.safeParse({ ...valid, preferredDateTo: '2026-08-09' })
        .success,
    ).toBe(false);
  });
  it('rejeita faixa de horário invertida', () => {
    expect(
      CreateAppointmentWaitlistRequestSchema.safeParse({ ...valid, preferredTimeEnd: '08:59' })
        .success,
    ).toBe(false);
  });
  it('não aceita dados arbitrários na conversão', () => {
    expect(
      ConvertAppointmentWaitlistRequestSchema.safeParse({
        opportunityPublicId: '44444444-4444-4444-8444-444444444444',
        customerPublicId: valid.customerPublicId,
      }).success,
    ).toBe(false);
  });
});
