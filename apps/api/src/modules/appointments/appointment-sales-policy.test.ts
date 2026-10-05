import { describe, expect, it, vi } from 'vitest';

import { AppointmentService } from './appointment.service.js';

const input = {
  customerPublicId: 'customer',
  professionalPublicId: 'professional',
  servicePublicId: 'service',
  startsAt: '2026-10-04T12:00:00.000Z',
  source: 'INTERNAL',
};

function buildService(tenant: unknown) {
  const repo = {
    customer: vi.fn().mockResolvedValue({ id: 1n }),
    professional: vi.fn().mockResolvedValue({ id: 2n }),
    service: vi.fn().mockResolvedValue({
      id: 3n,
      durationMinutes: 30,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
      priceCents: 100n,
      pricingMode: 'FIXED',
    }),
    combo: vi.fn().mockResolvedValue({
      id: 6n,
      name: 'Combo',
      priceCents: 200n,
      active: true,
      items: [
        {
          serviceId: 3n,
          service: {
            active: true,
            durationMinutes: 30,
            hasPostServiceBreak: false,
            postServiceBreakMinutes: 0,
          },
        },
      ],
    }),
    link: vi.fn().mockResolvedValue({
      active: true,
      durationMinutes: null,
      hasPostServiceBreak: null,
      postServiceBreakMinutes: null,
      priceCents: null,
    }),
    unit: vi.fn().mockResolvedValue(null),
    conflict: vi.fn().mockResolvedValue(false),
    createIfAvailable: vi.fn().mockResolvedValue(null),
  };
  const client = {
    tenant: { findFirst: vi.fn().mockResolvedValue(tenant) },
  };
  const service = new AppointmentService(
    repo as never,
    { assertSlot: vi.fn().mockResolvedValue(undefined) } as never,
    client as never,
  );
  return { service, repo };
}

async function save(service: AppointmentService, useCombo = false) {
  const request = useCombo
    ? { ...input, servicePublicId: undefined, comboPublicId: 'combo' }
    : input;
  return (service as unknown as { save: (...args: unknown[]) => Promise<unknown> }).save(1n, request, {
    userId: null,
    sessionId: null,
  });
}

describe('AppointmentService single-service sales policy', () => {
  it('blocks a new SERVICE_PRICE appointment for membership tenants when disabled', async () => {
    const { service, repo } = buildService({
      operatingModel: 'MEMBERSHIP',
      settings: { allowSingleServiceSales: false },
    });

    await expect(save(service, true)).rejects.toMatchObject({
      code: 'SINGLE_SERVICE_SALES_DISABLED',
      statusCode: 409,
    });
    expect(repo.createIfAvailable).not.toHaveBeenCalled();
  });

  it('does not apply the flag to SERVICE_PRICING tenants', async () => {
    const { service, repo } = buildService({
      operatingModel: 'SERVICE_PRICING',
      settings: { allowSingleServiceSales: false },
    });

    await expect(save(service)).rejects.toMatchObject({ code: 'APPOINTMENT_CONFLICT' });
    expect(repo.createIfAvailable).toHaveBeenCalledOnce();
  });
});
