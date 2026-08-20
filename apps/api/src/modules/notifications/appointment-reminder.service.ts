import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatWhen,
} from './appointment-notification.service.js';
import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type AppointmentReminderConfigService } from './appointment-reminder-config.service.js';
import { type PrismaClient } from '../../database-client/client.js';

export class AppointmentReminderService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly dispatcher: CustomerNotificationDispatcher,
    _configService: AppointmentReminderConfigService,
  ) {}

  /**
   * Schedule day-before reminders for appointments.
   * Elegibilidade (apenas para CRIAR job, não para ENTREGAR):
   * 1. scheduledAt >= appointment.createdAt (não retroativo)
   */
  public async scheduleDayBeforeReminders(): Promise<{ scheduled: number }> {
    const now = new Date();

    const tenants = await this.client.tenant.findMany({
      where: { appointmentReminderConfig: { isNot: null } },
      select: { id: true, timezone: true, appointmentReminderConfig: true },
    });

    let scheduled = 0;

    for (const tenant of tenants) {
      const config = tenant.appointmentReminderConfig;
      if (!config?.dayBeforeEnabled) continue;

      const appointments = await this.client.appointment.findMany({
        where: {
          tenantId: tenant.id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startsAt: { gt: now },
        },
        include: {
          customer: { select: { id: true, publicId: true, name: true } },
          professional: { select: { publicName: true } },
          service: { select: { name: true } },
          tenant: { select: { timezone: true, currency: true } },
          unit: { select: { name: true } },
        },
      });

      const existingReminders = await this.client.notificationLog.findMany({
        where: {
          tenantId: tenant.id,
          kind: 'appointment.day_before_reminder',
          targetType: 'appointment',
          targetPublicId: { in: appointments.map((a) => a.publicId) },
          status: { not: 'SKIPPED' },
        },
        select: { targetPublicId: true, id: true, scheduledAt: true },
      });
      const existingMap = new Map(existingReminders.map((r) => [r.targetPublicId, r]));

      for (const appointment of appointments) {
        const scheduledAt = this.calculateDayBeforeScheduledAt(
          appointment.startsAt,
          tenant.timezone,
          config.dayBeforeDaysBefore,
          config.dayBeforeHour,
          config.dayBeforeMinute,
        );

        const isEligible = this.isReminderEligible(scheduledAt, appointment.createdAt);
        if (!isEligible) continue;

        const existing = existingMap.get(appointment.publicId);
        if (existing) {
          if (existing.scheduledAt?.getTime() === scheduledAt.getTime()) continue;
          await this.client.notificationLog.update({
            where: { id: existing.id },
            data: { scheduledAt },
          });
          scheduled += 1;
          continue;
        }

        const startsAtIso = appointment.startsAt.toISOString();
        const localDate = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeZone: tenant.timezone,
        });
        const dispatched = await this.dispatcher.dispatch(
          appointment.tenantId,
          appointment.customer.id,
          'appointment.day_before_reminder',
          appointment.publicId,
          {
            customerName: appointment.customer.name,
            protocol: appointment.protocol,
            serviceName: appointment.service.name,
            professionalName: appointment.professional.publicName,
            when: formatWhen(startsAtIso, tenant.timezone),
            date: formatAppointmentDate(startsAtIso, tenant.timezone),
            time: formatAppointmentTime(startsAtIso, tenant.timezone),
            isToday: String(localDate.format(appointment.startsAt) === localDate.format(now)),
            unitName: appointment.unit?.name ?? '',
            value: (Number(appointment.priceCents) / 100).toLocaleString('pt-BR', {
              style: 'currency',
              currency: appointment.tenant.currency,
            }),
            canceledReasonLine: '',
          },
          'appointment',
          undefined,
          scheduledAt,
        );
        if (dispatched) scheduled += 1;
      }
    }

    return { scheduled };
  }

  /**
   * Schedule upcoming reminders for appointments.
   * Same elegibility rules as day-before.
   */
  public async scheduleUpcomingReminders(): Promise<{ scheduled: number }> {
    const now = new Date();

    const tenants = await this.client.tenant.findMany({
      where: { appointmentReminderConfig: { isNot: null } },
      select: { id: true, timezone: true, appointmentReminderConfig: true },
    });

    let scheduled = 0;

    for (const tenant of tenants) {
      const config = tenant.appointmentReminderConfig;
      if (!config?.upcomingEnabled) continue;

      const appointments = await this.client.appointment.findMany({
        where: {
          tenantId: tenant.id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startsAt: { gt: now },
        },
        include: {
          customer: { select: { id: true, publicId: true, name: true } },
          professional: { select: { publicName: true } },
          service: { select: { name: true } },
          tenant: { select: { timezone: true, currency: true } },
          unit: { select: { name: true } },
        },
      });

      const existingReminders = await this.client.notificationLog.findMany({
        where: {
          tenantId: tenant.id,
          kind: 'appointment.upcoming_reminder',
          targetType: 'appointment',
          targetPublicId: { in: appointments.map((a) => a.publicId) },
          status: { not: 'SKIPPED' },
        },
        select: { targetPublicId: true, id: true, scheduledAt: true },
      });
      const existingMap = new Map(existingReminders.map((r) => [r.targetPublicId, r]));

      for (const appointment of appointments) {
        const scheduledAt = new Date(
          appointment.startsAt.getTime() - config.upcomingMinutesBefore * 60_000,
        );

        const isEligible = this.isReminderEligible(scheduledAt, appointment.createdAt);
        if (!isEligible) continue;

        const existing = existingMap.get(appointment.publicId);
        if (existing) {
          if (existing.scheduledAt?.getTime() === scheduledAt.getTime()) continue;
          await this.client.notificationLog.update({
            where: { id: existing.id },
            data: { scheduledAt },
          });
          scheduled += 1;
          continue;
        }

        const startsAtIso = appointment.startsAt.toISOString();
        const localDate = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeZone: tenant.timezone,
        });
        const dispatched = await this.dispatcher.dispatch(
          appointment.tenantId,
          appointment.customer.id,
          'appointment.upcoming_reminder',
          appointment.publicId,
          {
            customerName: appointment.customer.name,
            protocol: appointment.protocol,
            serviceName: appointment.service.name,
            professionalName: appointment.professional.publicName,
            when: formatWhen(startsAtIso, tenant.timezone),
            date: formatAppointmentDate(startsAtIso, tenant.timezone),
            time: formatAppointmentTime(startsAtIso, tenant.timezone),
            isToday: String(localDate.format(appointment.startsAt) === localDate.format(now)),
            unitName: appointment.unit?.name ?? '',
            value: (Number(appointment.priceCents) / 100).toLocaleString('pt-BR', {
              style: 'currency',
              currency: appointment.tenant.currency,
            }),
            canceledReasonLine: '',
          },
          'appointment',
          undefined,
          scheduledAt,
        );
        if (dispatched) scheduled += 1;
      }
    }

    return { scheduled };
  }

  private isReminderEligible(
    scheduledAt: Date,
    createdAt: Date,
  ): boolean {
    return scheduledAt >= createdAt;
  }

  private calculateDayBeforeScheduledAt(
    startsAt: Date,
    timezone: string,
    daysBefore: number,
    hour: number,
    minute: number,
  ): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone,
    });

    const parts = formatter.formatToParts(startsAt);
    const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
    const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
    const appHour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const appMinute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
    const appSecond = parseInt(parts.find((p) => p.type === 'second')!.value, 10);

    const appLocalDate = new Date(year, month, day, appHour, appMinute, appSecond);
    const tzOffsetMs = startsAt.getTime() - appLocalDate.getTime();

    const targetLocalDate = new Date(year, month, day - daysBefore, hour, minute, 0, 0);
    return new Date(targetLocalDate.getTime() + tzOffsetMs);
  }

}
