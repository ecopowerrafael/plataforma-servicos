import { describe, expect, it, vi } from 'vitest';

import { MultiUnitService } from './multi-unit.service.js';

describe('multi-unit overview', () => {
  it('aggregates persisted metrics and forwards the authenticated unit scope', async () => {
    const repository = {
      units: vi
        .fn()
        .mockResolvedValue([
          {
            id: 10n,
            publicId: '11111111-1111-4111-8111-111111111111',
            name: 'Centro',
            isHeadquarters: true,
          },
        ]),
      appointmentMetrics: vi.fn().mockResolvedValue([
        { unitId: 10n, status: 'COMPLETED', _count: { _all: 2 }, _sum: { priceCents: 15000n } },
        { unitId: 10n, status: 'CANCELED', _count: { _all: 1 }, _sum: { priceCents: 5000n } },
      ]),
      customerMetrics: vi.fn().mockResolvedValue([{ primaryUnitId: 10n, _count: { _all: 4 } }]),
      professionalMetrics: vi.fn().mockResolvedValue([{ unitId: 10n, _count: { _all: 3 } }]),
    };
    const service = new MultiUnitService(repository);
    const scope = ['11111111-1111-4111-8111-111111111111'];
    const result = await service.overview(
      1n,
      scope,
      new Date('2026-08-01'),
      new Date('2026-08-31'),
    );
    expect(repository.units).toHaveBeenCalledWith(1n, scope);
    expect(result.units[0]).toMatchObject({
      appointments: 3,
      completedAppointments: 2,
      revenueCents: '15000',
      customers: 4,
      professionals: 3,
    });
  });
});
