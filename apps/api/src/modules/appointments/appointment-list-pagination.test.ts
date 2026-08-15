import { describe, expect, it, vi } from 'vitest';

import { AppointmentService } from './appointment.service.js';

import type { AppointmentRepository } from './appointment.repository.js';

const record = (publicId: string) => ({
  publicId,
  protocol: 'AGD-1',
  customer: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Cliente', phone: null },
  professional: { publicId: '00000000-0000-4000-8000-000000000002', publicName: 'Rafael' },
  service: { publicId: '00000000-0000-4000-8000-000000000003', name: 'Corte' },
  unit: null,
  startsAt: new Date('2026-08-17T12:00:00.000Z'),
  endsAt: new Date('2026-08-17T12:30:00.000Z'),
  durationMinutes: 30,
  postServiceBreakMinutes: 0,
  priceCents: 9000n,
  status: 'CONFIRMED' as const,
  notes: null,
  source: 'INTERNAL',
  canceledReason: null,
  rescheduleReason: null,
  isFitIn: false,
  fitInReason: null,
  checkedInAt: null,
  depositType: null,
  depositPercentage: null,
  depositAmountCents: null,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
});

function service(list: ReturnType<typeof vi.fn>, count: ReturnType<typeof vi.fn>) {
  return new AppointmentService(
    { list, count } as unknown as AppointmentRepository,
    {} as never,
  );
}

const query = { from: '2026-08-17T00:00:00.000Z', to: '2026-08-17T23:59:59.999Z' };

describe('listagem paginada de agendamentos', () => {
  it('sem limit devolve o período inteiro e não consulta o total', async () => {
    const list = vi.fn().mockResolvedValue([record('00000000-0000-4000-8000-000000000001')]);
    const count = vi.fn();
    const result = await service(list, count).list(1n, query);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBeUndefined();
    expect(count).not.toHaveBeenCalled();
    expect(list.mock.calls[0]?.[3]).toBeUndefined();
  });

  it('com limit aplica skip/take e devolve o total real', async () => {
    const list = vi.fn().mockResolvedValue([record('00000000-0000-4000-8000-000000000002')]);
    const count = vi.fn().mockResolvedValue(128);
    const result = await service(list, count).list(1n, { ...query, page: 3, limit: 20 });
    expect(list.mock.calls[0]?.[3]).toEqual({ skip: 40, take: 20 });
    expect(result).toMatchObject({ total: 128, page: 3, limit: 20 });
  });

  it('ordena conforme a direção pedida, mantendo ascendente por padrão', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    await service(list, count).list(1n, { ...query, limit: 10, direction: 'desc' });
    expect(list.mock.calls[0]?.[2]).toEqual({ startsAt: 'desc' });
    await service(list, count).list(1n, query);
    expect(list.mock.calls[1]?.[2]).toEqual({ startsAt: 'asc' });
  });
});
