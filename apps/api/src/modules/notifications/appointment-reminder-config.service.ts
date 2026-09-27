import { type PrismaClient, type AppointmentReminderConfig } from '../../database-client/client.js';

export interface AppointmentReminderConfigInput {
  dayBeforeEnabled?: boolean;
  dayBeforeDaysBefore?: number;
  dayBeforeHour?: number;
  dayBeforeMinute?: number;
  upcomingEnabled?: boolean;
  upcomingMinutesBefore?: number;
}

export class AppointmentReminderConfigService {
  public constructor(private readonly client: PrismaClient) {}

  public async getOrCreate(tenantId: bigint): Promise<AppointmentReminderConfig> {
    let config = await this.client.appointmentReminderConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.client.appointmentReminderConfig.create({
        data: { tenantId },
      });
    }

    return config;
  }

  public async update(
    tenantId: bigint,
    input: AppointmentReminderConfigInput,
  ): Promise<AppointmentReminderConfig> {
    const config = await this.getOrCreate(tenantId);
    return this.client.appointmentReminderConfig.update({
      where: { id: config.id },
      data: {
        ...(input.dayBeforeEnabled !== undefined && { dayBeforeEnabled: input.dayBeforeEnabled }),
        ...(input.dayBeforeDaysBefore !== undefined && { dayBeforeDaysBefore: input.dayBeforeDaysBefore }),
        ...(input.dayBeforeHour !== undefined && { dayBeforeHour: input.dayBeforeHour }),
        ...(input.dayBeforeMinute !== undefined && { dayBeforeMinute: input.dayBeforeMinute }),
        ...(input.upcomingEnabled !== undefined && { upcomingEnabled: input.upcomingEnabled }),
        ...(input.upcomingMinutesBefore !== undefined && {
          upcomingMinutesBefore: input.upcomingMinutesBefore,
        }),
      },
    });
  }
}
