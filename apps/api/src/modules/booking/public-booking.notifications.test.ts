import { describe, expect, it, vi } from 'vitest';

import { PublicBookingService } from './public-booking.service.js';

import type { AppointmentService } from '../appointments/appointment.service.js';
import type { AvailabilityService } from '../calendar/availability.service.js';
import type { CustomerService } from '../customers/customer.service.js';
import type { AppointmentNotificationService } from '../notifications/appointment-notification.service.js';
import type { ProfessionalServiceLinkService } from '../professionals/professional-service.service.js';
import type { TenantWhiteLabelRepository } from '../tenants/tenant-white-label.repository.js';
import type { TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';

const appointment = {
  publicId: '3f1f0f4a-0f2b-4a1e-9a3e-9d9a1b2c3d4e',
  protocol: 'AG-0001',
  status: 'CONFIRMED',
  startsAt: '2026-09-01T13:00:00.000Z',
  endsAt: '2026-09-01T13:30:00.000Z',
  serviceName: 'Corte',
  professionalName: 'Ana',
  unitName: null,
  customerName: 'Cliente',
  customerPublicId: '9a9a9a9a-0f2b-4a1e-9a3e-9d9a1b2c3d4e',
  canceledReason: null,
};

const input = {
  servicePublicId: '11111111-0f2b-4a1e-9a3e-9d9a1b2c3d4e',
  professionalPublicId: '22222222-0f2b-4a1e-9a3e-9d9a1b2c3d4e',
  startsAt: '2026-09-01T13:00:00.000Z',
  customer: { name: 'Cliente', email: 'cliente@exemplo.com', phone: null },
};

function build(notify = vi.fn().mockResolvedValue(undefined)) {
  const tenants = {
    findActiveTenantBySlug: vi.fn().mockResolvedValue({ id: 7n }),
  } as unknown as TenantWhiteLabelRepository;
  const customers = {
    identifyOrCreatePublic: vi.fn().mockResolvedValue({ publicId: appointment.customerPublicId }),
  } as unknown as CustomerService;
  const appointments = {
    create: vi.fn().mockResolvedValue(appointment),
  } as unknown as AppointmentService;
  const service = new PublicBookingService(
    tenants,
    {} as TenantWhiteLabelService,
    {} as ProfessionalServiceLinkService,
    customers,
    appointments,
    {} as AvailabilityService,
    { notifyBookingConfirmed: notify } as unknown as AppointmentNotificationService,
  );
  return { service, notify, appointments };
}

describe('agendamento pelo site público', () => {
  it('notifica o cliente pelo mesmo caminho da criação interna', async () => {
    const { service, notify } = build();
    const confirmation = await service.createBooking('barbearia', input);

    expect(notify).toHaveBeenCalledWith(7n, appointment);
    expect(confirmation.protocol).toBe('AG-0001');
  });

  it('não desfaz o agendamento se a notificação falhar', async () => {
    const notify = vi.fn().mockRejectedValue(new Error('fila indisponível'));
    const { service } = build(notify);

    await expect(service.createBooking('barbearia', input)).resolves.toMatchObject({
      protocol: 'AG-0001',
    });
    expect(notify).toHaveBeenCalledOnce();
  });
});
