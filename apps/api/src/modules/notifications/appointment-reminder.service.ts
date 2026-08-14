import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatWhen,
} from './appointment-notification.service.js';
import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type PrismaClient } from '../../database-client/client.js';

const REMINDER_WINDOW_HOURS = 24;

export class AppointmentReminderService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly dispatcher: CustomerNotificationDispatcher,
  ) {}

  /**
   * Varre, em todos os tenants, os agendamentos que começam dentro da
   * janela de lembrete (próximas REMINDER_WINDOW_HOURS horas) e ainda não
   * têm um lembrete registrado, e despacha um por agendamento elegível.
   * Idempotente: consulta os NotificationLog já existentes para o par
   * (kind, targetPublicId) antes de despachar, como pré-filtro; a
   * constraint única em NotificationLog (agora incluindo canal/destinatário)
   * garante a mesma idempotência por canal mesmo sob concorrência entre
   * execuções do worker.
   */
  public async scheduleUpcomingReminders(): Promise<{ scheduled: number }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000);

    const appointments = await this.client.appointment.findMany({
      where: { startsAt: { gte: now, lte: windowEnd }, status: { in: ['PENDING', 'CONFIRMED'] } },
      include: {
        customer: { select: { id: true, publicId: true, name: true } },
        professional: { select: { publicName: true } },
        service: { select: { name: true } },
        tenant: { select: { timezone: true, currency: true } },
        unit: { select: { name: true } },
      },
    });
    if (appointments.length === 0) return { scheduled: 0 };

    const existing = await this.client.notificationLog.findMany({
      where: {
        kind: 'appointment.reminder',
        targetType: 'appointment',
        targetPublicId: { in: appointments.map((item) => item.publicId) },
      },
      select: { targetPublicId: true },
    });
    const alreadyScheduled = new Set(existing.map((item) => item.targetPublicId));

    let scheduled = 0;
    for (const appointment of appointments) {
      if (alreadyScheduled.has(appointment.publicId)) continue;

      const startsAtIso = appointment.startsAt.toISOString();
      const localDate = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: appointment.tenant.timezone,
      });
      const dispatched = await this.dispatcher.dispatch(
        appointment.tenantId,
        appointment.customer.id,
        'appointment.reminder',
        appointment.publicId,
        {
          customerName: appointment.customer.name,
          protocol: appointment.protocol,
          serviceName: appointment.service.name,
          professionalName: appointment.professional.publicName,
          when: formatWhen(startsAtIso, appointment.tenant.timezone),
          date: formatAppointmentDate(startsAtIso, appointment.tenant.timezone),
          time: formatAppointmentTime(startsAtIso, appointment.tenant.timezone),
          isToday: String(localDate.format(appointment.startsAt) === localDate.format(now)),
          unitName: appointment.unit?.name ?? '',
          value: (Number(appointment.priceCents) / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: appointment.tenant.currency,
          }),
          canceledReasonLine: '',
        },
      );
      if (dispatched) scheduled += 1;
    }
    return { scheduled };
  }
}
