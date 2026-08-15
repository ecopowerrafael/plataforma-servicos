import {
  AppointmentPublicSchema,
  AppointmentQuerySchema,
  AppointmentStatusRequestSchema,
  CreateAppointmentRequestSchema,
  UpdateAppointmentRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const ids = {
  customerPublicId: '11111111-1111-4111-8111-111111111111',
  professionalPublicId: '22222222-2222-4222-8222-222222222222',
  servicePublicId: '33333333-3333-4333-8333-333333333333',
};
const base = {
  ...ids,
  startsAt: '2026-09-01T15:00:00.000Z',
  source: 'INTERNAL',
};

describe('contratos de agendamentos', () => {
  it('aceita cria\u00e7\u00e3o v\u00e1lida e rejeita identificadores ou datas inv\u00e1lidas', () => {
    expect(CreateAppointmentRequestSchema.parse(base)).toMatchObject(ids);
    expect(() =>
      CreateAppointmentRequestSchema.parse({ ...base, startsAt: 'amanh\u00e3' }),
    ).toThrow();
    expect(() =>
      CreateAppointmentRequestSchema.parse({ ...base, professionalPublicId: 'profissional' }),
    ).toThrow();
  });

  it('exige formato seguro para motivos e observações', () => {
    expect(() => AppointmentStatusRequestSchema.parse({ reason: 'x' })).toThrow();
    expect(() =>
      UpdateAppointmentRequestSchema.parse({ ...base, rescheduleReason: 'x' }),
    ).toThrow();
    expect(
      UpdateAppointmentRequestSchema.parse({
        ...base,
        rescheduleReason: 'Reuni\u00e3o do cliente',
      }),
    ).toMatchObject({ rescheduleReason: 'Reuni\u00e3o do cliente' });
    expect(() =>
      CreateAppointmentRequestSchema.parse({ ...base, notes: 'x'.repeat(2001) }),
    ).toThrow();
  });

  it('exige motivo quando o agendamento \u00e9 marcado como encaixe', () => {
    expect(() => CreateAppointmentRequestSchema.parse({ ...base, isFitIn: true })).toThrow();
    expect(
      CreateAppointmentRequestSchema.parse({
        ...base,
        isFitIn: true,
        fitInReason: 'Cliente chegou sem hor\u00e1rio',
      }),
    ).toMatchObject({ isFitIn: true, fitInReason: 'Cliente chegou sem hor\u00e1rio' });
    expect(CreateAppointmentRequestSchema.parse(base)).toMatchObject({ isFitIn: false });
  });

  it('aceita filtros de per\u00edodo e rejeita status ou filtros desconhecidos', () => {
    expect(
      AppointmentQuerySchema.parse({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
        status: 'CONFIRMED',
        ...ids,
      }),
    ).toMatchObject({ status: 'CONFIRMED' });
    expect(() =>
      AppointmentQuerySchema.parse({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
        status: 'UNKNOWN',
      }),
    ).toThrow();
  });

  it('expõe o snapshot e os motivos sem IDs internos', () => {
    const result = AppointmentPublicSchema.parse({
      publicId: '44444444-4444-4444-8444-444444444444',
      protocol: 'AGD-000001',
      ...ids,
      customerName: 'Cliente',
      customerPhone: null,
      professionalName: 'Profissional',
      serviceName: 'Consulta',
      unitPublicId: null,
      unitName: null,
      startsAt: '2026-09-01T15:00:00.000Z',
      endsAt: '2026-09-01T16:00:00.000Z',
      durationMinutes: 45,
      postServiceBreakMinutes: 15,
      priceCents: '15000',
      status: 'CANCELED',
      notes: null,
      source: 'INTERNAL',
      canceledReason: 'Solicita\u00e7\u00e3o do cliente',
      rescheduleReason: null,
      isFitIn: false,
      fitInReason: null,
      checkedInAt: null,
      depositType: null,
      depositPercentage: null,
      depositAmountCents: null,
      createdAt: '2026-08-01T15:00:00.000Z',
      updatedAt: '2026-08-01T15:00:00.000Z',
    });
    expect(result).toMatchObject({ durationMinutes: 45, postServiceBreakMinutes: 15 });
    expect(Object.hasOwn(result, 'id')).toBe(false);
  });
});
