import { type AppointmentPublicSchema } from '@plataforma/shared';
import { type z } from 'zod';

import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type PrismaClient } from '../../database-client/client.js';

type AppointmentPublic = z.infer<typeof AppointmentPublicSchema>;

export function formatWhen(startsAtIso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(startsAtIso));
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(startsAtIso));
  }
}

export class AppointmentNotificationService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly dispatcher: CustomerNotificationDispatcher,
  ) {}

  public async notifyBookingConfirmed(tenantId: bigint, appointment: AppointmentPublic) {
    await this.notify(tenantId, appointment, 'appointment.booking_confirmed');
  }

  public async notifyBookingCanceled(tenantId: bigint, appointment: AppointmentPublic) {
    await this.notify(tenantId, appointment, 'appointment.booking_canceled');
  }

  private async notify(
    tenantId: bigint,
    appointment: AppointmentPublic,
    kind: 'appointment.booking_confirmed' | 'appointment.booking_canceled',
  ) {
    const [customer, tenant] = await Promise.all([
      this.client.customer.findFirst({
        where: { tenantId, publicId: appointment.customerPublicId },
        select: { id: true },
      }),
      this.client.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
    ]);
    if (customer === null) return;

    await this.dispatcher.dispatch(tenantId, customer.id, kind, appointment.publicId, {
      customerName: appointment.customerName,
      protocol: appointment.protocol,
      serviceName: appointment.serviceName,
      professionalName: appointment.professionalName,
      when: formatWhen(appointment.startsAt, tenant?.timezone ?? 'UTC'),
      canceledReasonLine:
        appointment.canceledReason === null ? '' : `\nMotivo: ${appointment.canceledReason}`,
    });
  }
}
