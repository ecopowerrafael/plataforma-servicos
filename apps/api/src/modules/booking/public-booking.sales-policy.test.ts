import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../errors/AppError.js';
import { PublicBookingService } from './public-booking.service.js';

describe('PublicBookingService sales policy convergence', () => {
  it('propagates the canonical SERVICE_PRICE policy rejection', async () => {
    const appointmentError = new AppError({
      code: 'SINGLE_SERVICE_SALES_DISABLED',
      message: 'A venda de atendimentos avulsos está desativada para este estabelecimento.',
      statusCode: 409,
    });
    const appointments = {
      create: vi.fn().mockRejectedValue(appointmentError),
    };
    const service = new PublicBookingService(
      { findActiveTenantBySlug: vi.fn().mockResolvedValue({ id: 1n }) } as never,
      {} as never,
      {} as never,
      { identifyOrCreatePublic: vi.fn().mockResolvedValue({ publicId: 'customer' }) } as never,
      appointments as never,
      {} as never,
    );

    await expect(
      service.createBooking('tenant', {
        customer: { name: 'Cliente', phone: null, email: null },
        professionalPublicId: '11111111-1111-4111-8111-111111111111',
        servicePublicId: '22222222-2222-4222-8222-222222222222',
        startsAt: '2026-10-04T12:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'SINGLE_SERVICE_SALES_DISABLED', statusCode: 409 });
    expect(appointments.create).toHaveBeenCalledOnce();
  });
});
